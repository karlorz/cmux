Do not use .unwrap (except in tests).
Make sure to run clippy and fix all lint warnings.
Before finishing, make sure to run tests and `docker build`. The user will be running either `./scripts/cmux.sh` or the global `cmux-debug` binary, and we want to make sure it starts as fast as possible (so we need to prime the docker cache).
Since the user might sometimes use the global `cmux-debug` bin, make sure to use `./scripts/build-cli.sh`.
If any code changes impacts the Docker container, you should check for existing cmux-sandbox containers, kill them, rebuild, and start the container again, using the docker cli.
You should also build
After finishing, use the macOS `say` command to notify the user with a short description of what to check/the next action the user should take (like a shell command/url/program they should interact with to veriy).
