# Deployment Instructions

Here are the steps to deploy the monitoring application on your server (`10.15.37.30`) using Docker.

## Prerequisites

Ensure Docker and Docker Compose are installed on your server.

```bash
# Check Docker version
docker --version

# Check Docker Compose version
docker compose version
# OR
docker-compose --version
```

## Deployment Steps

1.  **Transfer Files**: Upload the project files to your server. You can use `scp` or `rsync`.

    ```bash
    scp -r ./monitoring user@10.15.37.30:/path/to/destination
    ```

2.  **Navigate to Directory**: SSH into your server and go to the project directory.

    ```bash
    ssh user@10.15.37.30
    cd /path/to/destination/monitoring
    ```

3.  **Start the Application**: Run the following command to build and start the container in the background.

    ```bash
    docker compose up -d --build
    # OR if using older docker-compose
    docker-compose up -d --build
    ```

4.  **Verify Deployment**: Check if the container is running.

    ```bash
    docker ps
    ```
    You should see a container named `govmon` running on port `3000`.

5.  **Access Dashboard**: Open your browser and navigate to:
    `http://10.15.37.30:3000`

## Data Persistence

The application data is stored in the `data` directory on the host machine (mapped to `/app/data` in the container). This ensures that your added servers and settings are saved even if the container is restarted or recreated.

## Troubleshooting

-   **View Logs**:
    ```bash
    docker logs -f govmon
    ```

-   **Restart Container**:
    ```bash
    docker compose restart govmon
    ```

-   **Stop Application**:
    ```bash
    docker compose down
    ```
