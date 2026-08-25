"""macOS UriOpenerPort adapter: `open <uri>` (LaunchServices)."""
from __future__ import annotations

import logging
import shutil
import subprocess

log = logging.getLogger("catodo.infrastructure.macos.uri_opener")


class MacOpenUriOpener:
    def open(self, uri: str) -> bool:
        bin_ = shutil.which("open")
        if not bin_:
            log.warning("macOS `open` not found in PATH")
            return False
        try:
            subprocess.Popen(
                [bin_, uri],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            log.info("opened uri via `open`: %s", uri)
            return True
        except Exception as e:
            log.warning("`open %s` failed: %s", uri, e)
            return False