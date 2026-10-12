# Demo video script and speaker notes

Timed to the recorded demo (2:45, 1920×1200, 30 fps). That recording predates the rename to Fuel the Robot Economy, the settlement loop, live runs, and Lumen's inspection events: it still shows the old title, the residents' house, and the rent payment, so the picture needs a new take before the script below matches it. The narrated cut uses offline Piper TTS (voice `en_US-ryan-high`). A silent cut with identical picture is available for re-dubbing. Read each block starting at its timestamp. Each block fits inside its window with room to spare, so a slightly slower human read still lands before the next cut.

Pronunciation: **peaq** = "peek", **Agung** = "AH-goong", **Lumen** = "LOO-men".

| # | Start | Window | On screen | Say |
| --- | --- | --- | --- | --- |
| 1 | 0:01 | 24 s | The yard paused at dawn. Camera slowly orbits and returns. | This is Fuel the Robot Economy: a live 3D solar farm where the machines run their own economy on peaq. A cleaning rover, an inspection drone, and a battery pack each hold a peaq machine ID and a wallet. They get paid for verified work and buy their own energy, with no invoice and no human approval in the loop. |
| 2 | 0:25 | 13 s | Play. Caption "Dust lands on the panels", then "Lumen inspects the panels". | Each day starts with dust. It settles on the panels and output falls. Lumen, the drone, inspects the rows first and reports them dirty. Only then does Kepler, the rover, leave the dock. |
| 3 | 0:38 | 18 s | Kepler drives the aisles with the brush down. Phase strip on "Wash". | Kepler washes every row and steers around a blocked one. Its battery drains as it works. The caption below always says what is happening, and the strip shows where we are in the day. |
| 4 | 0:56 | 8 s | Lumen's second pass. "Recovered yield booked". | Lumen flies a second pass, hashes the recovered yield into a proof, and reports the inspection to peaq's EventRegistry. |
| 5 | 1:04 | 10 s | Coin flies City → Plant owner, then Plant owner → Robot owner. Cards marked PAYS / GETS. | That proof unlocks payment. The city pays the plant owner for the power, and the plant owner pays the robot owner for the cleaning. The cards on the right mark who pays, and who gets paid. |
| 6 | 1:14 | 12 s | Kepler returns to the dock; 0.01 PEAQ to the Battery; refill beam. | Kepler drives back to the dock and pays the battery for twenty-two kilowatt hours, from its own wallet. The plant then refills the battery from its own panels, so the loop can run again tomorrow. |
| 7 | 1:26 | 21 s | Sidebar scrolls to machine IDs and "Agung receipts" with the green "Live on Agung" badge. Cut to Lumen's inspection event on Subscan (Success), then back. | None of this is a mock ledger. This visit is a live run: the four machines are registered on peaq's Agung testnet, and every payment and every inspection event was just sent and links to its transaction. Here is Lumen's event on Subscan, confirmed on chain. `npm run verify` re-checks the machine IDs, the payments, and the events. |
| 8 | 1:47 | 28 s | Speed 4×. Days 2 and 3 run; receipts fill in; "Settled — funds reset for next run". | At four times speed, the next days play out. Watch the receipts panel fill as each payment and inspection lands. At the end, the plant owner, the robot owner, and the battery return everything to the run reserve that funded the run, so the next visitor's run starts from the same budget and only gas is spent. |
| 9 | 2:15 | 18 s | "How it works" guide opens and scrolls: Real on peaq Agung, Simulated, Controls. | The How it works guide tells a judge exactly what is real on peaq and what is simulated. Identities, payments, and Lumen's inspection events are on chain. The rover, the drone, and the physics are simulated in the browser. |
| 10 | 2:33 | 12 s | Back to the yard, run complete. | Fuel the Robot Economy shows the machine economy in one complete loop: machines with identities, earning for verified work and paying for their own energy, settled on peaq. Thanks for watching. |

The TTS cut has about 14 s of quiet after block 8 (2:00–2:14) while the 4× run reaches the settlement on screen. When re-recording, an optional line fits there: "Three days, fourteen payments, three inspection reports, and not one invoice: each payment is released by a machine's own proof of work."

## Re-recording the voiceover

1. Open the silent cut in any editor (CapCut, iMovie, DaVinci Resolve, or Loom's "upload video").
2. Record each block from its start time. Keep a block shorter than its window, or trim the picture to match.
3. Export as MP4, upload to YouTube (unlisted) or Loom, and paste the link into the submission form.

To regenerate the recording itself: start the yard (`npm run build && npm start`), then use a Playwright script that drives the same steps on a 1920×1200 fullscreen Chrome while `ffmpeg -f x11grab` captures the display.
