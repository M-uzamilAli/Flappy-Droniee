# Flappy Droniee

Flappy Droniee is a local browser obstacle game. The PC displays the course and the phone acts as a motion controller. Tilting the phone sets the drone's height. Holding the angle holds that height while the course scrolls.

## Run locally

1. Follow the [local HTTPS setup](GAME-SETUP.md) to install dependencies, create the certificate, and trust it on the phone.
2. Connect the PC and phone to the same Wi-Fi. From this folder, run `npm.cmd start -- 192.168.1.20`, replacing the example address with your PC's Wi-Fi IPv4 address.
3. Open the HTTPS address printed by the server on the PC. Scan the game's QR on the phone and tap **Enable Motion**.
4. Hold the phone comfortably in landscape, camera on the left, and press **Start Game** on the phone or the PC. That grip becomes neutral. To enable sound when starting from the phone, click **Enable Sound** on the PC once.

## Controls and course

- The default **Full Tilt** is 20°. Neutral corresponds to 50% height. Use **Controller settings** on the PC to change the tilt range.
- Press **C** on the PC during play to make your current grip neutral again.
- Use **Pause Game**, **Resume Game**, and **Play Again** on the phone.
- The first 20 seconds use large, centered gaps. The course speeds up with time, and higher scores unlock more pipe patterns. A Drifter can appear from score 5. A laser can appear from score 10, with a one-second warning before it fires.

## Problems We Solved

| Problem | What changed |
| --- | --- |
| The original PC page could only replay recorded motion or use phyphox for live input. | The game now serves its own phone controller. A QR code pairs the phone to the PC's local WebSocket host so live play can run from two browsers. |
| A temporary Wi-Fi disconnect interrupted a run. | The phone retries with its saved pairing credential. The game pauses while motion is missing and resumes when readings return. A manual pause stays paused across reconnects. |
| Players hold their phones at different resting angles. | **Start Game** uses the player's current grip as neutral. **C** lets the player reset it during the run. |
| Small hand movements and uneven sample arrivals made the height jitter. | A small dead zone filters movement near neutral. Each frame estimates tilt from the latest reading and recent tilt speed, with a 25 ms look-ahead cap. A One Euro filter smooths small changes while responding faster to deliberate tilts. |
| Tilting past full travel left the drone pinned while the player reversed. | The game clamps stored tilt at the configured Full Tilt limit. Extra rotation past that limit no longer accumulates. |
| Slow frames made scrolling and the round timer fall behind. | The world processes the full time between frames in smaller steps so collision checks can still run as pipes move. |
| Repeated straight gaps made the course predictable. | The course adds zigzag, staircase, tunnel and narrow patterns after the easy opening. Pipe spacing and gap positions are bounded, Drifters keep clear of pipes, and the laser only selects a band that leaves upcoming pipe openings clear. |
| It was hard to tell whether a delay came from arriving motion or the game. | The PC displays round-trip ping and gyro arrival gaps. The CSV includes sample timing, frame timing, estimated tilt, target height and actual height so these can be compared after a run. |

## How the Game Evolved

1. **Gyro replay.** We started with a standalone page that opened phyphox recordings. It rendered a rotating phone, graphed the three gyro axes, and showed how recorded tilt could move a drone up or down.
2. **Live prototype.** We connected phyphox over Wi-Fi and fed live samples into the same rotation logic. Testing in a camera-left landscape grip led to **Set Neutral**, so each player's comfortable grip could become the starting point for altitude.
3. **Browser game and phone controller.** We put the game in a separate page and built our own phone controller. A QR code opens the controller on the PC's local HTTPS host, and a WebSocket carries live motion and play controls. We kept the side-scrolling obstacle course and gave it a drone-style control rule. Phone tilt sets a height, and holding that tilt holds the drone there. That lets players steer through a gap and hold their line as the course moves past.
4. **Test, measure, and tune.** We exported real sessions and compared gyro arrival gaps, ping, target height, actual height, and frame timing. Logs showed that motion beyond Full Tilt could leave the drone pinned while the player reversed, and that some jitter came from uneven sample arrival. We clamped the stored tilt, added a short per-frame estimate, and used adaptive smoothing to keep small movements steady while letting larger movements respond faster.

### Completed gameplay phases

| Phase | What we added |
| --- | --- |
| **1. Foundation** | Count the full time between frames for scrolling and the round timer, recenter with **C**, and record why a run ended in the CSV. |
| **2. Pipe patterns** | Start with wide center gaps, then unlock zigzags, staircases, tunnels, and narrow gaps. Later tuning increased the vertical variety and avoided consecutive repeats when alternatives were available. |
| **3. Drifter** | Add a wave-shaped flight path and check pipe clearance before the enemy can appear. The player can climb or descend around it. |
| **4. Laser** | Add a visible warning before firing. Choose the beam position by checking upcoming pipe openings so the player has an escape route. |

## Motion logs

On the PC, use **Controller settings → Download Motion Log** before refreshing the game tab. The CSV includes sample and frame rows, ping, run starts, recentering, obstacle spawns, laser warnings and firings, and the cause of each death. Ping is a round-trip measurement. Gyro arrival gaps show the time between readings received by the PC.

## Project files

- [game.html](game.html) runs the course, interprets tilt, and exports the motion CSV.
- [controller.html](controller.html) reads phone motion and sends play controls.
- [game-server.mjs](game-server.mjs) serves both pages and handles local HTTPS, QR pairing, and WebSocket relay.
- [game-link.js](game-link.js) manages browser WebSocket connections and retries.
- [gyro-replay.html](gyro-replay.html) is the separate gyro analysis page for recorded playback and phyphox Live Mode.
