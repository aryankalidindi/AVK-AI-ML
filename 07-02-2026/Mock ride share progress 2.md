[[Mock ride share progress]]  
[[Mock Ride Share Design]] 
[[Live Speech Translation Design]]

Fable is back. May use that to enhance this project. Not sure how yet, but will look into it. 


As mentioned yesterday, I will be using an LLM to add context to the transcriptions which will then give a contextually appropriate response.



It mostly works for now. Adding context below in case I pick up more on it later.

CLAUDE CONTEXT:
RideLingo is a working Uber/Grab-style rideshare demo with live, on-device translation:
- Auto-pairing dispatch (no room codes), full ride lifecycle, editorial dark UI
- On-device Whisper speech-to-text (no cloud speech service), browser TTS
- Context-aware translation via Claude when ANTHROPIC_API_KEY is set, free gtx fallback otherwise
- Currency conversion (IDR→USD), a local glossary for app terms/place names, and a per-message "Show original" toggle
- 53 tests passing, all packages type-check clean, E2E green — everything committed on master

No keys are required to run it (npm run dev:server + npm run dev:web); a Claude key is only an optional quality upgrade.

Specs and plans are in docs/superpowers/ if you pick this back up later. 