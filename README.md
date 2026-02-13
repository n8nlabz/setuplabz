# 🚀 N8N LABZ Setup Panel

Painel web completo para instalação e gerenciamento de ferramentas de automação.
Desenvolvido para a comunidade **N8N LABZ**.

## O que faz?

| Feature | Descrição |
|---------|-----------|
| ⚡ Instalação 1 clique | n8n, Evolution API, Portainer + Traefik |
| 📊 Monitoramento | CPU, RAM, status de todos os containers |
| 💾 Backup & Restore | Workflows e credenciais do n8n |
| 🔐 Autenticação | Tokens exclusivos para alunos |

## Como o aluno usa

```bash
# 1. O aluno compra uma VPS (Ubuntu 20.04+)
# 2. Acessa via SSH e roda:
curl -fsSL https://raw.githubusercontent.com/SEU_USUARIO/n8nlabz-setup/main/scripts/install.sh | bash

# 3. Acessa http://IP_DA_VPS:3080 no navegador
# 4. Gera o token de acesso no primeiro uso
# 5. Instala as ferramentas pelo painel visual
```

## Estrutura

```
n8nlabz-setup/
├── backend/
│   ├── server.js                 # Express + WebSocket
│   ├── package.json
│   ├── middleware/auth.js         # Autenticação por token
│   ├── routes/
│   │   ├── auth.js               # Login / setup / tokens
│   │   ├── install.js            # Instalar ferramentas
│   │   ├── containers.js         # Start/stop/restart/stats
│   │   ├── backup.js             # Criar/restaurar/download
│   │   └── system.js             # Info do servidor
│   └── services/
│       ├── docker.js             # Comunicação com Docker
│       ├── install.js            # Templates compose + deploy
│       └── backup.js             # Backup/restore n8n
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx               # App completo com 3 páginas
│       └── hooks/api.js          # Client API
├── scripts/
│   └── install.sh                # Instalador para VPS
├── .gitignore
├── package.json
└── README.md
```

## API

### Auth
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /api/auth/setup | Primeiro acesso (gera token admin) |
| POST | /api/auth/token | Gera token para aluno |
| GET | /api/auth/check | Verifica token |
| GET | /api/auth/tokens | Lista tokens |

### Instalação
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/install/status | Ferramentas instaladas |
| POST | /api/install/:toolId | Instalar ferramenta |
| DELETE | /api/install/:toolId | Remover ferramenta |

### Containers
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/containers | Lista com stats |
| POST | /api/containers/:id/start | Iniciar |
| POST | /api/containers/:id/stop | Parar |
| POST | /api/containers/:id/restart | Reiniciar |
| GET | /api/containers/:id/logs | Ver logs |

### Backup
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/backup | Lista backups |
| POST | /api/backup/create | Criar backup |
| POST | /api/backup/restore | Restaurar (upload .tar.gz) |
| GET | /api/backup/download/:file | Download |
| DELETE | /api/backup/:file | Deletar |

## Requisitos do servidor

- Ubuntu 20.04+ ou Debian 11+
- Mínimo 4GB RAM, 2 vCPUs
- Docker (instalado automaticamente)
- Domínio apontando pro IP (opcional)

## Segurança

- Tokens `labz_xxx...` gerados pelo admin
- Rate limiting 200 req/15min
- Helmet security headers
- Docker socket com acesso controlado

## Licença

Proprietário — N8N LABZ Community
