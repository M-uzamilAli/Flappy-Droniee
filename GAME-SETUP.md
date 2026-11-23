# Local browser game

1. Install dependencies with `npm.cmd install`.
2. Find your PC's Wi-Fi IPv4 address with `ipconfig`. Install [mkcert](https://github.com/FiloSottile/mkcert) and run these commands from this folder, replacing the example IP:

   ```powershell
   mkcert -install
   mkcert -key-file lan-key.pem -cert-file lan-cert.pem 192.168.1.20 localhost 127.0.0.1
   mkcert -CAROOT
   npm.cmd start -- 192.168.1.20
   ```

3. Trust the mkcert public root certificate (`rootCA.pem` from the printed CA directory) on your phone. On iOS, install the certificate profile and enable full trust in Settings. Keep the CA private key on the PC.
4. Open the printed HTTPS address on the host PC. Put both devices on the same Wi-Fi, scan the QR, then tap **Enable Motion** on the phone. If Windows prompts for network access, allow it for the private network you are using.
5. Hold the phone in landscape with its camera on the left and click **Start Game**. Tilt to set the drone's height. If the connection drops, keep your grip near its last angle until the game resumes.

The host supports one game tab and one paired phone. A dropped phone socket retries automatically using its session credential. The course pauses when motion stops and resumes from the held altitude once motion returns. Reloading the game tab starts a fresh run. Restarting the server resets pairing. No motion data leaves the local network.
