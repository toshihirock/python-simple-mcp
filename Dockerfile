FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY my_mcp_server.py .

EXPOSE 80

CMD ["python", "my_mcp_server.py"]
