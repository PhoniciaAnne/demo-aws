# 🚀 DR Simulator — Deployment & Run Guide

This simulator is a **static web application** (HTML/CSS/JS). It does not require a backend or database to run, making it extremely easy to deploy for demos.

---

## 💻 How to Run Locally

1.  **Navigate** to the project folder: `C:\Users\phoni\.gemini\antigravity\scratch\dr-metrics-simulator\`
2.  **Double-click** `index.html`.
3.  The simulator will open in your default browser.

---

## 🌐 How to Deploy (Showcase it to others)

### Option 1: Vercel / Netlify (Fastest - 1 minute)
1.  Go to [Vercel](https://vercel.com/import) or [Netlify](https://app.netlify.com/drop).
2.  **Drag and drop** the `dr-metrics-simulator` folder directly onto the page.
3.  You will get a live URL (e.g., `https://my-dr-simulator.vercel.app`) instantly.

### Option 2: AWS S3 Static Website Hosting
1.  Create an **S3 Bucket** (e.g., `my-dr-demo-bucket`).
2.  **Upload** all files (`index.html`, `styles`, `scripts`).
3.  Go to **Properties** -> **Static website hosting** -> **Enable**.
4.  Set **Index document** to `index.html`.
5.  *Note: Ensure bucket permissions allow public read if you want it accessible externally.*

### Option 3: AWS Amplify
1.  Push this code to a **GitHub/GitLab** repository.
2.  Go to the **AWS Amplify Console**.
3.  Click **New App** -> **Host web app**.
4.  Connect your repository. Amplify will automatically deploy it setiap time you push code.

---

## 🛠️ How to use the Interactive Demo
- **Trigger Random Outage**: The main red button will pick one of the 9 services at random.
- **Manual Trigger**: Click any service in the **AWS Service Health** dashboard on the right (e.g., click "Amazon S3") to fail that specific service.
- **Reset**: Click the **↺ Reset** button to return to a "Healthy" state.
- **Speed**: Use the **1x / 2x / 5x** buttons to speed up the recovery sequence for fast-paced demos.
