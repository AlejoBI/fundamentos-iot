FROM nodered/node-red:4.0

# Nodo para ejecutar consultas MySQL desde Node-RED
RUN npm install --no-audit --no-fund --unsafe-perm node-red-node-mysql

COPY --chmod=755 docker/node-red/bootstrap.sh /usr/src/node-red/bootstrap.sh

ENTRYPOINT ["/usr/src/node-red/bootstrap.sh"]
