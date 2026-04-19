# RSA Keys Directory

This directory contains the RSA public and private keys used for password encryption during login.

**Files:**

- `rsa_public.pem` - Public key (sent to frontend)
- `rsa_private.pem` - Private key (used for decryption on backend)

**Security Notes:**

- The private key should NEVER be committed to version control
- Both files are automatically generated on first server start
- Keys persist across server restarts to prevent decryption failures
- If you need to regenerate keys, delete both .pem files and restart the server

**Important:**
Make sure to add `*.pem` to your `.gitignore` file to prevent accidentally committing private keys.
