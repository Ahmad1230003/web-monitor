# System Resource Monitor

A live CPU / RAM / Disk usage dashboard built with Flask + psutil, running inside a Docker container (Ubuntu).

## Run it

```
docker compose up --build
```

Once the build finishes, open your browser at:

```
http://localhost:5000
```

## Stop it

```
docker compose down
```