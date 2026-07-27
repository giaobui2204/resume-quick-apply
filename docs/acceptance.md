# MVP acceptance checklist

## Foundation

- Open the dashboard and navigate every section with keyboard controls.
- Refresh after editing a profile and verify that local preview data remains.
- Delete preview data from Settings and verify that it disappears.

## Resume and profile

- Start Ollama, pull the configured model, and upload valid PDF and DOCX files.
- Stop Ollama and verify the UI explains how to start it.
- Configure a nonexistent model and verify the UI shows the exact `ollama pull` command.
- Reject unsupported and larger-than-10-MB files.
- Verify extracted fields can be corrected.
- Confirm work authorization explicitly; change a value and verify confirmation is cleared.

## Job intelligence

- Import a public Greenhouse job.
- Import a public Lever job.
- Import the same URL twice and verify deduplication.
- Verify unsupported sites report a clear error.
- Verify every non-unknown sponsorship signal shows evidence from the posting.

## Queue

- Add analyzed jobs to the queue.
- Verify the same job cannot be added twice.
- Prepare only one job at a time.
- Remove a job without changing other queue entries.

## Extension

- Load the unpacked extension and save a verified name and email.
- Open supported Greenhouse and Lever application fixtures/pages.
- Confirm the panel detects fields but does not fill until clicked.
- Confirm existing values are preserved.
- Confirm demographic and legal fields remain untouched.
- Confirm CAPTCHA detection disables autofill and displays a manual handoff.
- Confirm the extension never clicks a submit button.
