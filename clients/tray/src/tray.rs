//! Tray icon registration.

use anyhow::Result;
use tauri::{
    menu::{MenuBuilder, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle,
};

/// Initial install: tray icon + a placeholder menu. The menu is rebuilt
/// by `menu::rebuild` whenever MenuState changes.
pub fn install(app: &AppHandle) -> Result<()> {
    let placeholder = MenuBuilder::new(app)
        .item(&MenuItem::with_id(
            app,
            "starting",
            "Iniciando…",
            false,
            None::<&str>,
        )?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("Salir"))?)
        .build()?;

    TrayIconBuilder::with_id("main")
        .menu(&placeholder)
        .show_menu_on_left_click(true)
        .tooltip("Cátodo")
        .icon(app.default_window_icon().cloned().unwrap_or_else(|| {
            tauri::image::Image::new_owned(vec![0u8; 4], 1, 1)
        }))
        .on_menu_event(|app, event| {
            crate::menu::handle_menu_event(app, event);
        })
        .build(app)?;

    // Kick off the first rebuild so the menu reflects MenuState immediately.
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        crate::menu::rebuild(&app_clone).await.ok();
    });
    Ok(())
}