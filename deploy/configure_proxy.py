"""Add hesabcheckfrontend.testgrelo.online (HTTP→HTTPS + Let's Encrypt) to the shared nginx, preserving other hosts."""
import datetime
import pathlib
import re
import subprocess

CONFIG = pathlib.Path('/root/hospital-appointment-demo/nginx.conf')
PROXY = 'hospital-appointment-demo-nginx-1'
DOMAIN = 'hesabcheckfrontend.testgrelo.online'
ROOT = pathlib.Path('/root/hesabcheck-frontend')

HTTP = f'''server {{
    listen 80;
    server_name {DOMAIN};
    location ^~ /.well-known/acme-challenge/ {{
        root /var/www/certbot;
        default_type "text/plain";
        try_files $uri =404;
    }}
    location / {{ return 301 https://$host$request_uri; }}
}}'''

HTTPS = f'''server {{
    listen 443 ssl;
    server_name {DOMAIN};
    ssl_certificate /etc/letsencrypt/live/{DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:20m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    client_max_body_size 12m;
    resolver 127.0.0.11 valid=10s ipv6=off;
    add_header Strict-Transport-Security "max-age=31536000" always;
    location / {{
        set $hesabcheck_frontend hesabcheck-frontend:8080;
        proxy_pass http://$hesabcheck_frontend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_send_timeout 660s;
        proxy_read_timeout 660s;
    }}
}}'''


def without_domain(text):
    matches = []
    for start in re.finditer(r'(?m)^server\s*\{', text):
        depth = 0
        for offset in range(text.index('{', start.start()), len(text)):
            depth += (text[offset] == '{') - (text[offset] == '}')
            if depth == 0:
                if re.search(r'server_name\s+' + re.escape(DOMAIN) + r'\s*;', text[start.start():offset + 1]):
                    matches.append((start.start(), offset + 1))
                break
    for start, end in reversed(matches):
        text = text[:start] + text[end:]
    return text.rstrip() + '\n'


def apply(text):
    previous = CONFIG.read_text()
    if previous == text:
        return
    try:
        CONFIG.write_text(text)  # keep the inode: Docker bind-mounts this file
        subprocess.run(['docker', 'exec', PROXY, 'nginx', '-t'], check=True)
        subprocess.run(['docker', 'exec', PROXY, 'nginx', '-s', 'reload'], check=True)
    except BaseException:
        CONFIG.write_text(previous)
        subprocess.run(['docker', 'exec', PROXY, 'nginx', '-s', 'reload'], check=True)
        raise


def main():
    original = CONFIG.read_text()
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    (ROOT / 'backups').mkdir(exist_ok=True)
    backup = ROOT / 'backups' / f'nginx-before-{stamp}.conf'
    backup.write_text(original)
    backup.chmod(0o600)
    if not (pathlib.Path('/etc/letsencrypt/live') / DOMAIN / 'fullchain.pem').exists():
        apply(without_domain(original) + '\n' + HTTP + '\n')
        subprocess.run(['certbot', 'certonly', '--webroot', '-w', '/root/certbot-webroot', '--non-interactive',
                        '--agree-tos', '--cert-name', DOMAIN, '-d', DOMAIN], check=True)
    apply(without_domain(CONFIG.read_text()) + '\n' + HTTP + '\n\n' + HTTPS + '\n')
    print(f'{DOMAIN} configured with HTTPS; other virtual hosts preserved.')


if __name__ == '__main__':
    main()
