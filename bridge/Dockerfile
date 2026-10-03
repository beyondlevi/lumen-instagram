FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 bridge \
 && mkdir /data && chown bridge /data

WORKDIR /app
COPY pyproject.toml README.md ./
COPY lumen_ig_bridge ./lumen_ig_bridge
RUN pip install --no-cache-dir .

ENV BRIDGE_HOST=0.0.0.0 \
    BRIDGE_PORT=8787 \
    IG_SESSION_FILE=/data/session.json
VOLUME /data
EXPOSE 8787
USER bridge
CMD ["python", "-m", "lumen_ig_bridge"]
