FROM node:20-slim

# Install system dependencies for scanners (nmap, nikto) and certs for outbound HTTPS
# Nikto isn't packaged in Debian slim, so we install prerequisites and fetch the tarball.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		nmap \
		perl \
		wget \
		ca-certificates \
		libnet-ssleay-perl \
		libio-socket-ssl-perl \
	&& rm -rf /var/lib/apt/lists/* \
	&& wget -O /tmp/nikto.tar.gz https://github.com/sullo/nikto/archive/refs/tags/2.5.0.tar.gz \
	&& tar -xzf /tmp/nikto.tar.gz -C /opt \
	&& mv /opt/nikto-2.5.0 /opt/nikto \
	&& rm /tmp/nikto.tar.gz \
	&& printf '#!/bin/sh\nexec perl /opt/nikto/program/nikto.pl "$@"\n' > /usr/local/bin/nikto \
	&& chmod +x /usr/local/bin/nikto

WORKDIR /usr/src/app


# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm install --only=production

# Copy source
COPY . ./

ENV PORT 8080

EXPOSE 8080

CMD ["npm", "start"]
