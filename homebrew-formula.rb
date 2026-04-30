cask "claude-usage-widget" do
  version "1.7.1"
  sha256 "PLACEHOLDER_SHA256_ARM64"

  url "https://github.com/SlavomirDurej/claude-usage-widget/releases/download/v#{version}/Claude-Usage-Widget-#{version}-macOS-arm64.dmg"
  name "Claude Usage Widget"
  desc "Desktop widget for monitoring Claude.ai usage statistics in real-time"
  homepage "https://github.com/SlavomirDurej/claude-usage-widget"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "Claude Usage Widget.app"

  zap trash: [
    "~/Library/Application Support/claude-usage-widget",
    "~/Library/Preferences/com.electron.claude-usage-widget.plist",
    "~/Library/Saved Application State/com.electron.claude-usage-widget.savedState",
  ]
end
