# EVE Starmap Deployment Guide

This document provides instructions for deploying the EVE Starmap application using Docker containers.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (version 20.10.0 or higher)
- [Docker Compose](https://docs.docker.com/compose/install/) (version 2.0.0 or higher)
- EVE Frontier API key (for retrieving solar system data)

## Configuration

1. Create a `.env` file in the project root directory based on the `docker.env.example` template:

   ```bash
   cp docker.env.example .env
   ```

2. Edit the `.env` file and update the following variables:

   - `ALLOWED_ORIGINS`: Add your frontend domain(s) for CORS configuration
   - `EVE_FRONTIER_API_KEY`: Your EVE Frontier API key
   - Any other environment-specific settings

## Deployment Options

### Option 1: Local Deployment with Docker Compose

1. From the project root directory, run:

   ```bash
   docker-compose up -d
   ```

2. Access the application at http://localhost

3. To view logs:

   ```bash
   docker-compose logs -f
   ```

4. To stop the application:

   ```bash
   docker-compose down
   ```

### Option 2: Coolify Deployment on AWS (Recommended)

1. Set up a Coolify instance on your AWS server by following the [Coolify installation guide](https://coolify.io/docs/installation/cloud-providers/aws).

2. In the Coolify dashboard, create a new service:

   - Select "Docker Compose"
   - Connect to your Git repository
   - Configure environment variables based on `.env` example
   - Set the build and run commands automatically (Coolify will detect the docker-compose.yml)

3. Deploy the application:

   - Click "Deploy" in the Coolify dashboard
   - Monitor the build and deployment logs
   - Once complete, your application will be running on the specified domain

4. Configure SSL/TLS:

   - In Coolify settings, enable SSL for your service
   - Choose between Let's Encrypt or custom certificates
   - Ensure your domain's DNS records point to your AWS server

### Option 3: Manual Docker Deployment

If you prefer to manually deploy the containers:

1. Build the images:

   ```bash
   docker build -t eve-starmap-server -f Dockerfile.server .
   docker build -t eve-starmap-client -f Dockerfile.client .
   ```

2. Create a Docker network:

   ```bash
   docker network create eve-starmap-network
   ```

3. Run the server container:

   ```bash
   docker run -d --name eve-starmap-server \
     --network eve-starmap-network \
     -p 5001:5001 \
     -v sqlite-data:/app/sqlite.db \
     -v sqlite-data-shm:/app/sqlite.db-shm \
     -v sqlite-data-wal:/app/sqlite.db-wal \
     --env-file .env \
     eve-starmap-server
   ```

4. Run the client container:

   ```bash
   docker run -d --name eve-starmap-client \
     --network eve-starmap-network \
     -p 80:80 \
     -e API_URL=http://eve-starmap-server:5001 \
     eve-starmap-client
   ```

## Persistence

SQLite database files are stored in Docker volumes to ensure data persistence:

- `sqlite-data`: Main database file
- `sqlite-data-shm`: SQLite shared memory file
- `sqlite-data-wal`: SQLite write-ahead log

To view volume information:

```bash
docker volume ls | grep sqlite-data
```

## Scaling and High Availability

For production environments requiring higher availability:

1. Consider migrating from SQLite to a more robust database like PostgreSQL
2. Use a container orchestration platform like Kubernetes
3. Implement a load balancer in front of multiple client instances
4. Set up monitoring and automatic restarts

## Troubleshooting

### CORS Issues

If you encounter CORS errors:

1. Verify the `ALLOWED_ORIGINS` environment variable is correctly set
2. Confirm your frontend is making requests to the correct server URL
3. Check server logs for CORS-related messages
4. Test with more permissive CORS settings temporarily for debugging

### WebSocket Connection Failures

If WebSocket connections fail:

1. Ensure the server container is accessible from the client
2. Verify WebSocket port is not blocked by firewalls
3. Check for CORS issues specific to WebSocket connections
4. Review server logs for connection rejection messages

### Database Errors

For database connection issues:

1. Ensure the SQLite volumes are properly mounted
2. Check file permissions on the database files
3. Verify the database is not corrupted

## Monitoring

For basic monitoring, utilize Docker's built-in health checks:

```bash
docker ps --format "{{.Names}}: {{.Status}}"
```

For more advanced monitoring, consider:

- Setting up Prometheus and Grafana
- Implementing application performance monitoring (APM)
- Creating custom health check endpoints with detailed status information

## Updates and Maintenance

To update the application:

1. Pull the latest code changes:

   ```bash
   git pull
   ```

2. Rebuild and restart the containers:

   ```bash
   docker-compose down
   docker-compose build
   docker-compose up -d
   ```

## Backup and Restore

To back up the SQLite database:

```bash
docker run --rm \
  -v sqlite-data:/source \
  -v $(pwd)/backups:/backup \
  alpine sh -c "tar -czf /backup/sqlite-backup-$(date +%Y%m%d).tar.gz -C /source ."
```

To restore from backup:

```bash
docker run --rm \
  -v sqlite-data:/target \
  -v $(pwd)/backups:/backup \
  alpine sh -c "tar -xzf /backup/sqlite-backup-20240501.tar.gz -C /target"
```

Replace `20240501` with your actual backup date.

## Security Considerations

1. Never store sensitive environment variables in version control
2. Use secrets management for API keys and credentials
3. Regularly update base Docker images to patch security vulnerabilities
4. Implement proper network isolation between containers
5. Use a web application firewall (WAF) for production deployments

---

For additional support or questions, please open an issue in the project repository. 