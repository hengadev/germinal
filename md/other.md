# 📐 IMPLEMENTATION PLAN — SVELTEKIT CONTACT FORM EMAIL (SMTP)

## 0. Context & Constraints (VERY IMPORTANT)

* Framework: **SvelteKit**
* Backend: **SvelteKit server runtime ONLY**
* Language: **TypeScript**
* Email method: **SMTP via Nodemailer**
* No Golang, no external backend, no client-side email sending
* GDPR-conscious (EU)
* Low-to-medium volume contact form
* No paid services
* No email-sending logic in the browser

---

## 1. Architecture Overview

The implementation MUST follow this flow:

```
Contact Page (Svelte)
  └── HTML form (method="POST")
        ↓
  +page.server.ts
      ├── form data validation
      ├── spam protection (honeypot)
      ├── rate limiting (simple, in-memory)
      └── email sending via SMTP (Nodemailer)
```

**The browser never sends emails directly.**

---

## 2. Contact Page Requirements (`+page.svelte`)

### 2.1 Form structure

* Use a standard HTML `<form method="POST">`
* No fetch, no JS submission logic
* Must include:

  * `name` (text, required)
  * `email` (email, required)
  * `message` (textarea, required)
  * **honeypot field** (hidden input)

### 2.2 UX feedback

* Display success message on successful submission
* Display error message if submission fails
* Use SvelteKit `form` data returned from server action

### 2.3 Honeypot field

* Hidden input with a plausible name (e.g. `company`)
* Must NOT be visible
* Bots filling it should be silently ignored

---

## 3. Server Action (`+page.server.ts`)

### 3.1 Action definition

* Use SvelteKit **Actions API**
* Default action only
* Must return:

  * `{ success: true }` on success
  * `fail(400)` for validation errors
  * `fail(500)` for email sending errors

---

### 3.2 Form data handling

* Extract form data using `request.formData()`
* Convert values safely to strings
* Validate:

  * All required fields present
  * Email has a basic valid format
* Reject empty or invalid submissions

---

### 3.3 Spam protection (mandatory)

#### 3.3.1 Honeypot logic

* If honeypot field is **not empty**:

  * Do NOT send email
  * Return `{ success: true }` (fake success)
  * Do NOT log error

#### 3.3.2 Rate limiting (simple)

* In-memory rate limiter:

  * Key: client IP
  * Limit: max 1 request per minute
* If exceeded:

  * Return `fail(429)`

---

## 4. Email Sending (Nodemailer)

### 4.1 Library

* Use **nodemailer**
* SMTP transport only
* No third-party email APIs

### 4.2 Transport configuration

* SMTP credentials must come from **environment variables**
* Must support:

  * Host
  * Port
  * Secure flag
  * Auth user
  * Auth password

---

### 4.3 Email content

* Subject: `"Nouveau message – Contact site"`
* Sender: site email (SMTP user)
* Reply-To: visitor email
* Recipient: configurable contact email
* Body:

  * Plain text version
  * HTML version with:

    * Name
    * Email
    * Message
* Must escape user input properly

---

## 5. Environment Variables

The implementation MUST rely on:

```
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS
CONTACT_RECEIVER
```

No hardcoded secrets.

---

## 6. Error Handling

* Errors must be caught explicitly
* Log errors server-side only
* Never expose SMTP errors to the client
* Client receives generic error message

---

## 7. GDPR & Data Handling

* No persistence of contact messages
* Messages are:

  * Received
  * Forwarded by email
  * Discarded
* No logging of message content
* No third-party trackers

---

## 8. Code Quality Requirements

* TypeScript everywhere
* No `any`
* Clear separation of concerns
* Minimal dependencies
* Comment critical logic (rate limit, honeypot)

---

## 9. Explicitly Forbidden

The implementation MUST NOT:

* Use Golang
* Use client-side email sending
* Use external paid services
* Store messages in a database
* Use Google reCAPTCHA
* Use API routes instead of SvelteKit actions
* Leak environment variables to the client

---

## 10. Expected Output From the LLM

The LLM should generate:

1. `+page.svelte` (contact form UI)
2. `+page.server.ts` (action + SMTP logic)
3. Example `.env` file
4. Short explanation of setup steps

Nothing else.
