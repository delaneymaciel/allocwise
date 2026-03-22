import pandas as pd
import io
import time
import csv
import re
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

# ENGINE DE ALTA PERFORMANCE: Injeção massiva via COPY do PostgreSQL
def pg_copy_method(table, conn, keys, data_iter):
    dbapi_conn = conn.connection
    with dbapi_conn.cursor() as cur:
        s_buf = io.StringIO()
        writer = csv.writer(s_buf)
        writer.writerows(data_iter)
        s_buf.seek(0)
        cur.copy_expert(f"COPY {table.name} ({', '.join(keys)}) FROM STDIN WITH CSV", s_buf)


def process_csv_and_upsert(file_content):
    start_time = time.time()
    df = None

    # RESILIÊNCIA MÁXIMA: Matriz combinatória de Encodings vs Separadores
    for enc in ['utf-8-sig', 'utf-8', 'latin-1', 'cp1252']:
        for sep in [',', ';']:
            try:
                temp_df = pd.read_csv(io.BytesIO(file_content), sep=sep, encoding=enc)
                # Só aceita a leitura se de fato encontrou mais de 1 coluna válida
                if not temp_df.empty and len(temp_df.columns) > 1:
                    df = temp_df
                    break # Quebra o loop do separador
            except Exception:
                continue
        if df is not None:
            break # Quebra o loop do encoding

    # GOVERNANÇA: Chega de falhar em silêncio. Se falhar, grita para a API!
    if df is None or df.empty or len(df.columns) <= 1:
        raise ValueError("O ficheiro está vazio, tem formatação inválida ou encoding não suportado.")

    if len(df) > MAX_ROWS:
        raise ValueError(f"O ficheiro excede o limite máximo de segurança de {MAX_ROWS} linhas.")

    df.columns = df.columns.str.strip()

    title_cols = df.filter(regex=r'^Title\s*\d*').columns.tolist()
    if title_cols:
        def sort_key(col):
            parts = col.split()
            return int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0

        title_cols_sorted = sorted(title_cols, key=sort_key)
        df['title'] = df[title_cols_sorted].ffill(axis=1).iloc[:, -1]
        df.drop(columns=title_cols_sorted, inplace=True, errors='ignore')

    df.rename(columns={k: v for k, v in MAPPING.items() if k in df.columns}, inplace=True)

    if 'area_path' in df.columns:
        df['area_path'] = df['area_path'].str.replace('Tecnologia\\', '', regex=False)

    # SANITIZAÇÃO: Limpa o email ("João Silva <joao@empresa.com>" vira "João Silva")
    if 'atribuido' in df.columns:
        df['atribuido'] = df['atribuido'].str.replace(r'\s*<[^>]+>', '', regex=True).str.strip()

    valid_cols = [c for c in df.columns if c in ALLOWED_COLUMNS]

    if 'id' not in valid_cols:
        raise ValueError("Coluna 'ID' é obrigatória e não foi encontrada no CSV.")

    df = df[valid_cols]

    # BLINDAGEM DE TIPAGEM ESTREITA (Impede .0 nas strings do Postgres)
    df['id'] = pd.to_numeric(df['id'], errors='coerce').astype('Int64')
    df = df.dropna(subset=['id'])
    df = df.drop_duplicates(subset=['id'])

    if 'parent_id' in df.columns:
        df['parent_id'] = pd.to_numeric(df['parent_id'], errors='coerce').astype('Int64')

    if 'priority' in df.columns:
        df['priority'] = pd.to_numeric(df['priority'], errors='coerce')
        df.loc[~df['priority'].isin([0, 1, 2, 3, 4, 5]), 'priority'] = None
        df['priority'] = df['priority'].astype('Int64')

    if 'tempo_gasto' in df.columns:
        df['tempo_gasto'] = pd.to_numeric(df['tempo_gasto'], errors='coerce')

    date_cols = ['ini_dev', 'fim_dev', 'ini_qa', 'fim_qa', 'ini_hml', 'fim_hml', 'est_prod']
    for col in date_cols:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], dayfirst=True, errors='coerce')
            
    # Adição de pd.NA para dar suporte nativo ao Int64 do Pandas
    df = df.replace({pd.NaT: None, float('nan'): None, pd.NA: None})

    with engine.begin() as conn:
        # TRUNCATE PURO: Removido o indesejável RESTART IDENTITY
        conn.execute(text("TRUNCATE TABLE azure_work_items"))
        
        # INGESTÃO BRUTAL: Aplicação do pg_copy_method com lotes massivos de 50.000
        df.to_sql(
            'azure_work_items', 
            conn, 
            if_exists='append', 
            index=False, 
            method=pg_copy_method, 
            chunksize=50000
        )

    return len(df), round(time.time() - start_time, 2)