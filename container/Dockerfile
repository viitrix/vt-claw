# vt-claw Agent Container
# Runs Pi Agent in isolated Linux VM with browser automation

FROM nikolaik/python-nodejs:python3.12-nodejs24-slim

# 必要的时候可以设置代理，或者使用镜像，注意替换为你自己的代理地址
# ENV http_proxy="http://192.168.100.197:7078"
# ENV https_proxy="http://192.168.100.197:7078"
# 关闭代理，只需要注释掉下面两行即可 
# ENV http_proxy=""
# ENV https_proxy=""

# 这里配置使用国内的 Debian 镜像源，提升安装速度
COPY container/debian.sources /etc/apt/sources.list.d/debian.sources

# Install system dependencies for builtin tools
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    file \
    git \
    htop \
    make \
    net-tools \
    wget \
    zip \
    ffmpeg \
    fd-find \
    ripgrep \
    alsa-utils \
    pkg-config \
    libpixman-1-dev \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Create the symbolic link
RUN ln -s /bin/fdfind /bin/fd

# Copy python requirements, and install Python dependencies
COPY container/requirements.txt ./
RUN uv pip install --system -r requirements.txt -i https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple

# Build opt packages
WORKDIR /opt/iLink-sdk
COPY opt/iLink-sdk/ ./
RUN npm install && npm run build

WORKDIR /opt/coding-agent
COPY opt/coding-agent/ ./
RUN npm install && npm run build

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY claw/package*.json ./
COPY claw/tsconfig.json ./
RUN npm install

# Create entrypoint script
COPY container/entrypoint.sh ./
RUN chmod +x ./entrypoint.sh

# Create workspace directories
RUN mkdir -p /workspace
RUN mkdir -p /home/pn/.pi/agent

# Set ownership to pn user (non-root) for writable directories
RUN chown -R pn:pn /workspace
RUN chown -R pn:pn /home/pn
RUN chmod 777 -R /home/pn

# Switch to non-root user (required for --dangerously-skip-permissions)
USER pn

# Entry point reads JSON from stdin, outputs JSON to stdout
ENTRYPOINT ["/app/entrypoint.sh"]