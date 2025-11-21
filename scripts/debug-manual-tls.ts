
import tls from "node:tls";
import net from "node:net";
import { CertificateManager } from "../apps/client/electron/main/preview-proxy-certs";

async function run() {
    console.log("Starting manual TLS debug...");
    const certManager = new CertificateManager();
    const hostname = "test.local";
    const { key, cert } = certManager.getCertDataForHost(hostname);
    
    const secureContext = tls.createSecureContext({ key, cert });

    const server = net.createServer((socket) => {
        console.log("Server: connection received");
        
        // Simulate reading some data (ClientHello) then upgrading
        socket.once("data", (chunk) => {
            console.log("Server: received initial data", chunk.length);
            
            // Pause socket to prevent flow
            socket.pause();
            
            // Unshift data back
            socket.unshift(chunk);
            
            // Create a TLS server context to handle the connection
            const tlsServer = tls.createServer({
                key,
                cert,
            });
            
            tlsServer.on("secureConnection", (tlsSocket) => {
                console.log("Server: TLS secure connection");
                tlsSocket.write("Hello from TLS Server");
                tlsSocket.on("data", (d) => console.log("Server: received cleartext:", d.toString()));
            });
            
            tlsServer.on("error", (err) => {
                console.error("Server: TLS server error", err);
            });
            
            // Emit connection
            // Note: tlsServer.emit("connection") might resume the socket?
            tlsServer.emit("connection", socket);
            
            // Ensure socket is resumed?
            socket.resume(); 
            // tls.Server might attach listeners and resume it.
        });
    });
    
    server.listen(0, () => {
        const address = server.address();
        const port = typeof address === 'string' ? 0 : address?.port;
        console.log(`Server listening on port ${port}`);
        
        const client = tls.connect({
            port,
            rejectUnauthorized: false,
            servername: hostname,
        }, () => {
            console.log("Client: connected");
            const peerCert = client.getPeerCertificate();
            console.log("Client: peer cert subject:", peerCert ? peerCert.subject : "null");
            client.end();
            server.close();
        });
        
        client.on("error", (err) => {
            console.error("Client error:", err);
            server.close();
        });
    });
}

run().catch(console.error);
