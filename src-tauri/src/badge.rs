use tauri::{AppHandle, Manager};

use crate::error::YapmodError;
use crate::window::MAIN_WINDOW;

/// The biggest number the badge shows.
const MAX_COUNT: i64 = 99;

/// Sets the unread badge on the dock or taskbar icon.
///
/// The count comes from the host app, which keeps track of the unread
/// messages on its own. A count of zero or less clears the badge.
///
/// macOS and Linux have a badge of their own, so the count goes straight to
/// the system. Windows has no badge, so the number is drawn into an image
/// that replaces the taskbar icon.
#[tauri::command]
pub fn set_badge_count(app: AppHandle, count: Option<i64>) -> Result<(), YapmodError> {
    apply(&app, badge_target(count))
}

/// Puts the count on the icon of the window.
///
/// macOS and Linux have a badge of their own, so the count goes straight to
/// the system. Windows has no badge, so the number is drawn into an image
/// that takes the place of the icon.
#[cfg(not(target_os = "windows"))]
fn apply(app: &AppHandle, count: Option<i64>) -> Result<(), YapmodError> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return Ok(());
    };

    window
        .set_badge_count(count)
        .map_err(|error| YapmodError::system(error.to_string()))
}

/// Puts the count on the icon of the window.
///
/// Windows has no badge, so the number is drawn into an image that takes the
/// place of the icon.
#[cfg(target_os = "windows")]
fn apply(app: &AppHandle, count: Option<i64>) -> Result<(), YapmodError> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return Ok(());
    };

    window
        .set_overlay_icon(count.map(overlay::render))
        .map_err(|error| YapmodError::system(error.to_string()))
}

/// Turns the count the host app sends into the value the badge takes.
///
/// The badge is only shown when there is something unread, so zero and
/// everything below it clears it. Counts above the maximum are cut off,
/// since the badge has no room for more.
fn badge_target(count: Option<i64>) -> Option<i64> {
    match count {
        Some(count) if count > 0 => Some(count.min(MAX_COUNT)),
        _ => None,
    }
}

/// Draws the badge Windows puts on the taskbar icon.
///
/// Windows has no badge of its own, so the number is drawn into an image
/// that takes the place of the icon. The drawing is kept on every platform,
/// so it can be tested wherever the tests run.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
mod overlay {
    use tauri::image::Image;

    /// The size of the image, in pixels.
    ///
    /// Windows scales the image down to the size of the taskbar icon.
    const SIZE: usize = 32;

    /// The color of the badge.
    const BACKGROUND: [u8; 4] = [220, 38, 38, 255];

    /// The color of the number.
    const FOREGROUND: [u8; 4] = [255, 255, 255, 255];

    /// The width of a digit, in pixels.
    const GLYPH_WIDTH: usize = 3;

    /// The height of a digit, in pixels.
    const GLYPH_HEIGHT: usize = 5;

    /// How much bigger a digit is drawn than its bitmap.
    const SCALE: usize = 4;

    /// The space between two digits, in pixels.
    const GAP: usize = SCALE;

    /// The digits, one bitmap per digit, five rows of three pixels.
    ///
    /// Every row is a bitmask, where the lowest bit is the leftmost pixel.
    const DIGITS: [[u8; GLYPH_HEIGHT]; 10] = [
        [0b111, 0b101, 0b101, 0b101, 0b111],
        [0b010, 0b110, 0b010, 0b010, 0b111],
        [0b111, 0b001, 0b111, 0b100, 0b111],
        [0b111, 0b001, 0b111, 0b001, 0b111],
        [0b101, 0b101, 0b111, 0b001, 0b001],
        [0b111, 0b100, 0b111, 0b001, 0b111],
        [0b111, 0b100, 0b111, 0b101, 0b111],
        [0b111, 0b001, 0b010, 0b010, 0b010],
        [0b111, 0b101, 0b111, 0b101, 0b111],
        [0b111, 0b101, 0b111, 0b001, 0b111],
    ];

    /// Draws the number of unread messages.
    pub fn render(count: i64) -> Image<'static> {
        let text = count.to_string();
        let digits: Vec<&[u8; GLYPH_HEIGHT]> = text
            .chars()
            .filter_map(|character| DIGITS.get(character.to_digit(10)? as usize))
            .collect();

        let mut pixels = vec![0u8; SIZE * SIZE * 4];

        draw_circle(&mut pixels);
        draw_digits(&mut pixels, &digits);

        Image::new_owned(pixels, SIZE as u32, SIZE as u32)
    }

    /// Fills the pixels that fall inside the badge.
    fn draw_circle(pixels: &mut [u8]) {
        let center = SIZE as f32 / 2.0;
        let radius = center - 1.0;

        for y in 0..SIZE {
            for x in 0..SIZE {
                let dx = x as f32 + 0.5 - center;
                let dy = y as f32 + 0.5 - center;

                if dx * dx + dy * dy > radius * radius {
                    continue;
                }

                put(pixels, x, y, BACKGROUND);
            }
        }
    }

    /// Draws the digits in the middle of the badge.
    fn draw_digits(pixels: &mut [u8], digits: &[&[u8; GLYPH_HEIGHT]]) {
        if digits.is_empty() {
            return;
        }

        let width = digits.len() * GLYPH_WIDTH * SCALE + (digits.len() - 1) * GAP;
        let start_x = (SIZE.saturating_sub(width)) / 2;
        let start_y = (SIZE.saturating_sub(GLYPH_HEIGHT * SCALE)) / 2;

        for (index, digit) in digits.iter().enumerate() {
            let offset = index * (GLYPH_WIDTH * SCALE + GAP);

            for (row, bits) in digit.iter().enumerate() {
                for column in 0..GLYPH_WIDTH {
                    if bits & (1 << (GLYPH_WIDTH - 1 - column)) == 0 {
                        continue;
                    }

                    for scale_y in 0..SCALE {
                        for scale_x in 0..SCALE {
                            let x = start_x + offset + column * SCALE + scale_x;
                            let y = start_y + row * SCALE + scale_y;

                            if x >= SIZE || y >= SIZE {
                                continue;
                            }

                            put(pixels, x, y, FOREGROUND);
                        }
                    }
                }
            }
        }
    }

    /// Puts one pixel on the canvas.
    fn put(pixels: &mut [u8], x: usize, y: usize, color: [u8; 4]) {
        let index = (y * SIZE + x) * 4;

        pixels[index..index + 4].copy_from_slice(&color);
    }
}
