import { Template } from 'e2b'

export const template = Template()
  .fromBaseImage()
  // Install essential dev tools (need sudo as default user is 'user')
  .runCmd('sudo apt-get update && sudo apt-get install -y curl wget git build-essential jq python3 python3-pip')
  // Install Node.js 22 (npm comes bundled)
  .runCmd('curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs')
  // Install Bun
  .runCmd('curl -fsSL https://bun.sh/install | bash && sudo cp ~/.bun/bin/bun /usr/local/bin/bun && sudo ln -sf /usr/local/bin/bun /usr/local/bin/bunx')
  // Install GitHub CLI
  .runCmd('curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list && sudo apt-get update && sudo apt-get install -y gh')
  // Cleanup
  .runCmd('sudo rm -rf /var/lib/apt/lists/*')
  // Setup workspace
  .runCmd('mkdir -p ~/workspace')
