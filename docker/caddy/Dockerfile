FROM caddy:2.9-alpine

COPY docker/caddy/Caddyfile /etc/caddy/Caddyfile
COPY frontend/dist /srv

EXPOSE 80
EXPOSE 443
EXPOSE 443/udp
