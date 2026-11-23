# OpenCode setup prompt (copy & paste)

Send this whole block to OpenCode (new chat). It will install CliprPro from GitHub by itself.

---

```text
Install CliprPro for me from GitHub and set it up end-to-end. I am not a developer — you must run the commands yourself.

Repo: https://github.com/mudasir-ciber/CliprPro

Do this in order:
1. Clone the repo if it is not already open: git clone https://github.com/mudasir-ciber/CliprPro.git
2. cd into CliprPro
3. npm install
4. npx playwright install chromium
5. npm run doctor
6. If doctor fails because FFmpeg is missing, tell me the simplest way to install FFmpeg on my OS and stop. Otherwise continue.
7. If doctor says READY, run: npm run demo
8. When done, tell me in simple words:
   - that install worked
   - the exact path of final.mp4
   - how I put my own script.txt + voiceover.mp3 in the input folder and run generate

Use the repo’s OpenCode skill/commands if available. Prefer npm scripts. Keep replies short and plain.
```

---

## After install (inside the repo in OpenCode)

You can also run the built-in command:

`/setup`

Or say: “setup CliprPro and verify with doctor”.
