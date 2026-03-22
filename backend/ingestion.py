import pandas as pd
import io
import time
from sqlalchemy import text
from database import engine

# O dicionário absoluto de tradução (Azure -> Nosso Banco em snake_case)
MAPPING = {
    'Area Path': 'area_path', 'AreaPath': 'area_path',
    'Parent': 'parent_id', 'ParentId': 'parent_id',
    'ID': 'id', 'Id': 'id',
    'Work Item Type': 'work_item_type', 'WorkItemType': 'work_item_type',
    'Tamanho do Projeto': 'tamanho_projeto', 'TamanhoProjeto': 'tamanho_projeto',
    'State': 'state',
    'Priority': 'priority', 'Prioridade': 'priority',
    'Tempo gasto': 'tempo_gasto', 'TempoGasto': 'tempo_gasto',
    'Assigned To': 'atribuido', 'Atribuido': 'atribuido',
    'Data Planejada Inicio Dev': 'ini_dev', 'IniDev': 'ini_dev',
    'Data estimada Dev': 'fim_dev', 'FimDev': 'fim_dev',
    'Data Planejada Inicio QA': 'ini_qa', 'IniQA': 'ini_qa',
    'Data Estimada QA': 'fim_qa', 'FimQA': 'fim_qa',
    'Data Planejada Inicio HML': 'ini_hml', 'IniHML': 'ini_hml',
    'Data estimada HML': 'fim_hml', 'FimHML': 'fim_hml',
    'Baseline Estimativa Subida em Produção': 'est_prod', 'EstProd': 'est_prod',
    'Title': 'title'
}

ALLOWED_COLUMNS = set(MAPPING.values())
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
        df['title'] = df[title_cols_sorted].ffill(axis=1).iloc[:, -1]
        df.drop(columns=title_cols_sorted, inplace=True, errors='ignore')

    # Renomear forçando snake_case
    df.rename(columns={k: v for k, v in MAPPING.items() if k in df.columns}, inplace=True)

    if 'area_path' in df.columns:
        df['area_path'] = df['area_path'].str.replace('Tecnologia\\', '', regex=False)

    valid_cols = [c for c in df.columns if c in ALLOWED_COLUMNS]

    if 'id' not in valid_cols:
        return 0, 0.0

    df = df[valid_cols]
    df = df.where(pd.notnull(df), None)

    df['id'] = pd.to_numeric(df['id'], errors='coerce')
    df = df.dropna(subset=['id'])
    df = df.drop_duplicates(subset=['id'])

    if 'priority' in df.columns:
        df['priority'] = pd.to_numeric(df['priority'], errors='coerce')
        df.loc[~df['priority'].isin([0, 1, 2, 3, 4, 5]), 'priority'] = None

    if 'tempo_gasto' in df.columns:
        df['tempo_gasto'] = pd.to_numeric(df['tempo_gasto'], errors='coerce')

    date_cols = ['ini_dev', 'fim_dev', 'ini_qa', 'fim_qa', 'ini_hml', 'fim_hml', 'est_prod']
    for col in date_cols:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], dayfirst=True, errors='coerce')
            
    # Tratamento crítico para PostgreSQL
    df = df.replace({pd.NaT: None, float('nan'): None})

    with engine.begin() as conn:
        # 1. Limpeza Brutal (Instantânea, pois não há mais FK segurando a tabela)
        conn.execute(text("TRUNCATE TABLE azure_work_items RESTART IDENTITY"))
        
        # 2. Bulk Insert em Memória (Padrão de Alta Performance)
        # O Pandas divide os dados em lotes (chunks) e faz a injeção massiva diretamente no Postgres
        df.to_sql(
            'azure_work_items', 
            conn, 
            if_exists='append', 
            index=False, 
            method='multi', 
            chunksize=5000
        )

    return len(df), round(time.time() - start_time, 2)