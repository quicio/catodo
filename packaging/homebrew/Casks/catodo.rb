cask "catodo" do
  version :latest
  sha256 :no_check

  url "https://github.com/quicio/catodo/releases/latest/download/Catodo-mac-arm64.zip"
  name "Cátodo"
  desc "CRT-inspired multimedia shell"
  homepage "https://github.com/quicio/catodo"

  depends_on :macos
  depends_on arch: :arm64

  app "Catodo.app"

  # Cátodo no está notarizado por Apple. El cask intenta quitar la cuarentena
  # para que la primera apertura no quede bloqueada por Gatekeeper.
  postflight_steps do
    run "/usr/bin/xattr",
        args:           ["-dr", "com.apple.quarantine", "/Applications/Catodo.app"],
        writable_paths: ["/Applications/Catodo.app"],
        must_succeed:   false
  end

  caveats <<~EOS
    Cátodo se distribuye sin notarización de Apple. Este cask intenta quitar la
    cuarentena; si macOS igual bloquea la primera apertura, usá clic derecho →
    Abrir sobre Catodo.app.
  EOS

  zap trash: [
    "~/.local/share/catodo",
  ]
end
