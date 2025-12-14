FROM node:20-slim

# Install system dependencies for scanners (nmap) and certs for outbound HTTPS
RUN apt-get update \
	&& apt-get install -y --no-install-recommends nmap nikto ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm install --only=production

# Copy source
COPY . ./

ENV PORT 8080

EXPOSE 8080

CMD ["npm", "start"]
