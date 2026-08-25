"""Linux UriOpenerPort adapter: xdg-open or gio open."""
from __future__ import annotations

import logging
import shutil
import subprocess
import webbrowser

log = logging.getLogger("catodo.infrastructure.linux.uri_opener")


class XdgUriOpener:
    def open(self, uri: str) -> bool:
        bin_ = shutil.which("xdg-open") or shutil.which("gio")
        if bin_:
            try:
                subprocess.Popen(
                    [bin_, uri],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
                log.info("opened uri via %s: %s", bin_, uri)
                return True
            except Exception as e:
                log.warning("open_uri failed with %s: %s", bin_, e)
        try:
            return webbrowser.open(uri)
        except Exception as e:
            log.warning("webbrowser.open failed for uri: %s", e)
            return False