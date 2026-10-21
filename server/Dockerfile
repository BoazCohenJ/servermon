FROM python:3.13-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends smartmontools util-linux ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY collect.py server.py entrypoint.sh /app/
RUN chmod +x /app/entrypoint.sh

ENV SERVERMON_DATA=/data \
    SERVERMON_PORT=8787
VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=60s --timeout=5s --retries=3 \
  CMD python3 -c "import urllib.request,os;urllib.request.urlopen('http://127.0.0.1:%s/health'%os.environ.get('SERVERMON_PORT','8787'),timeout=3)"

ENTRYPOINT ["/app/entrypoint.sh"]
