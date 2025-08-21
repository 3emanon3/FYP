This Program can only be run on windows, and not tested in Linux

1)	Install prerequisites (and add to PATH)
    a.	Git → install from git-scm.com
    b.	Node.js (LTS) → install from nodejs.org (includes npm)
    c.	ngrok → install from ngrok.com (for a temporary HTTPS URL)
    d.	Add the install folders to your System PATH (Windows: System Properties → Environment Variables → Path → Add)
    e.	Verify in a new terminal: 
        git --version
        node -v
        npm -v
        ngrok version
2)	Get required accounts & keys
    a.	Twilio: create account → enable WhatsApp Sandbox (or start sender registration)
        i.	Copy Account SID and Auth Token
        ii.	Note your WhatsApp number:
            1.	Sandbox: the shared number shown in Console.
            2.	Production: your registered sender (format +<E.164>)
    b.	Google AI Studio (Gemini): create project → Create API key → copy the key
    c.	(Optional for production later) WhatsApp Business Account (WABA): complete verification, connect it to Twilio, and request a WhatsApp Sender.
3)	Get the code and start the app
    a.	Run in terminal(replace <your-repo-url> with your actual path)
        git clone <your-repo-url>
    c.  Create a .env file follow the .env.example in TwilioAPI directory
    b.	Find start.bat and run, it should install needed dependencies and start the program
4)	Configure the app
    a.	Open the left Menu Sidebar and paste:
        i.	TWILIO_ACCOUNT_SID
        ii.	TWILIO_AUTH_TOKEN
        iii.	TWILIO_PHONE_NUMBER (use sandbox number now, production sender later)
        iv.	GEMINI_API_KEY
    b.	Click Save Information.
5)	Write and activate your prompt
    a.	In Inactive Prompts, click + Add New Block, type an instruction.
    b.	Drag blocks to Active Prompts; order is applied top-to-bottom (1,2,3…).
    c.	Keep blocks short and specific (tone, do/don’t, context usage).
6)	Start the service and test
    a.	Click Start Services.
    b.	Copy and Paste the given URL to Twilio Webhook
    c.	From your phone, WhatsApp the sandbox/production number.
    d.	You should receive an AI reply based on your active prompt.
7)	Troubleshooting (quick)
    a.	Blank page / app not starting → ensure Node LTS installed; try run npm install again inside both WhatsappChatBot directory and TwilioAPI directory; try start.bat.
    b.	Twilio not hitting webhook → ngrok must show requests; confirm HTTPS URL is pasted exactly and publicly reachable.
    c.	401/403 errors → recheck SID/Auth Token; save again.
    d.	No AI reply → verify Gemini key; check quota; look for errors in the UI status/logs
