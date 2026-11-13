# Official Alpine 3.24.3, resolved and scanned on 2026-10-31.
FROM alpine@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a
LABEL org.opencontainers.image.source="https://github.com/restic/rest-server" \
      org.opencontainers.image.revision="ad130de02124c445300f149fa4f8e826dfdd0e3f" \
      org.opencontainers.image.version="0.14.0-cv.20261031.2"
COPY rest-server /usr/local/bin/rest-server
COPY entrypoint.sh /usr/local/bin/receiver-entrypoint
RUN chmod 0555 /usr/local/bin/rest-server /usr/local/bin/receiver-entrypoint
USER 1028:100
ENTRYPOINT ["/bin/sh", "/usr/local/bin/receiver-entrypoint"]
