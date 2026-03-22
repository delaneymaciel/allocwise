# Usa uma imagem oficial e enxuta do Python
FROM python:3.11-slim

# Impede a criação de ficheiros .pyc e força o log no terminal (essencial para nuvem)
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copia e instala as dependências primeiro (Otimização de Cache do Docker)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copia o resto do código-fonte (respeitando o .dockerignore)
COPY . .

# Expõe a porta que o Uvicorn vai usar
EXPOSE 8000

# Comando de arranque idêntico ao que você roda localmente
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]