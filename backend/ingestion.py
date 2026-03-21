import pandas as pd
import io
import time
from sqlalchemy import text
from database import engine

ALLOWED_COLUMNS = {
    'Id','ParentId','AreaPath','Title','WorkItemType',
    'TamanhoProjeto','State','Priority','TempoGasto','Atribuido',
    'IniDev','FimDev','IniQA','FimQA','IniHML','FimHML','EstProd'
}

MAX_ROWS = 100_000

def process_csv_and_upsert(file_content):
    start_time = time.time()

    try:
        df = pd.read_csv(io.BytesIO(file_content), sep=';')
        if len(df.columns) <= 1:
            df = pd.read_csv(io.BytesIO(file_content), sep=',')
    except (pd.errors.ParserError, pd.errors.EmptyDataError, UnicodeError):
        try:
            df = pd.read_csv(io.BytesIO(file_content), sep=',')
        except Exception:
            return 0, 0.0

    if df.empty or len(df.columns) <= 1:
        return 0, 0.0

    if len(df) > MAX_ROWS:
        return 0, 0.0

    df.columns = df.columns.str.strip()

    title_cols = df.filter(regex=r'^Title\s*\d*').columns.tolist()

    if title_cols:
        def sort_key(col):
            parts = col.split()
            return int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0

        title_cols_sorted = sorted(title_cols, key=sort_key)
        df['Title'] = df[title_cols_sorted].ffill(axis=1).iloc[:, -1]
        df.drop(columns=title_cols_sorted, inplace=True, errors='ignore')

    mapping = {
        'Area Path': 'AreaPath',
        'Parent': 'ParentId',
        'ID': 'Id',
        'Work Item Type': 'WorkItemType',
        'Tamanho do Projeto': 'TamanhoProjeto',
        'State': 'State',
        'Priority': 'Priority',
        'Prioridade': 'Priority',
        'Tempo gasto': 'TempoGasto',
        'Assigned To': 'Atribuido',
        'Data Planejada Inicio Dev': 'IniDev',
        'Data estimada Dev': 'FimDev',
        'Data Planejada Inicio QA': 'IniQA',
        'Data Estimada QA': 'FimQA',
        'Data Planejada Inicio HML': 'IniHML',
        'Data estimada HML': 'FimHML',
        'Baseline Estimativa Subida em Produção': 'EstProd'
    }

    df.rename(columns={k: v for k, v in mapping.items() if k in df.columns}, inplace=True)

    if 'AreaPath' in df.columns:
        df['AreaPath'] = df['AreaPath'].str.replace('Tecnologia\\', '', regex=False)

    valid_cols = [c for c in df.columns if c in ALLOWED_COLUMNS]

    if 'Id' not in valid_cols:
        return 0, 0.0

    df = df[valid_cols]
    df = df.where(pd.notnull(df), None)

    df['Id'] = pd.to_numeric(df['Id'], errors='coerce')
    df = df.dropna(subset=['Id'])
    df = df.drop_duplicates(subset=['Id'])

    if 'Priority' in df.columns:
        df['Priority'] = pd.to_numeric(df['Priority'], errors='coerce')
        df.loc[~df['Priority'].isin([0, 1, 2, 3, 4, 5]), 'Priority'] = None

    if 'TempoGasto' in df.columns:
        df['TempoGasto'] = pd.to_numeric(df['TempoGasto'], errors='coerce')

    date_cols = ['IniDev', 'FimDev', 'IniQA', 'FimQA', 'IniHML', 'FimHML', 'EstProd']
    for col in date_cols:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], dayfirst=True, errors='coerce')

    with engine.begin() as conn:
        df.to_sql('Staging_WorkItems', conn, if_exists='replace', index=False)
        cols_str = ", ".join(df.columns)
        
        conn.execute(text(f"""
            DELETE FROM azure_work_items
            WHERE Id IN (SELECT Id FROM Staging_WorkItems)
        """))
        
        conn.execute(text(f"""
            INSERT INTO azure_work_items ({cols_str})
            SELECT {cols_str} FROM Staging_WorkItems
        """))
        
        conn.execute(text("DROP TABLE IF EXISTS Staging_WorkItems"))

    return len(df), round(time.time() - start_time, 2)