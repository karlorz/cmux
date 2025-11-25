use tui_textarea::TextArea;

use crate::mux::commands::{CommandMatch, MuxCommand};

/// Item types for palette rendering.
#[derive(Debug, Clone)]
pub enum PaletteItem {
    /// A header/separator for grouping.
    Header(String),
    /// A command with its details.
    Command {
        command: MuxCommand,
        is_highlighted: bool,
        label_highlights: Vec<usize>,
    },
}

/// State for the command palette.
#[derive(Debug)]
pub struct CommandPalette<'a> {
    pub visible: bool,
    pub search_input: TextArea<'a>,
    pub selected_index: usize,
    pub scroll_offset: usize,
    filtered_commands: Vec<CommandMatch>,
}

impl Default for CommandPalette<'_> {
    fn default() -> Self {
        Self::new()
    }
}

impl<'a> CommandPalette<'a> {
    pub fn new() -> Self {
        let mut search_input = TextArea::default();
        search_input.set_placeholder_text("Type to search commands...");
        search_input.set_cursor_line_style(ratatui::style::Style::default());

        Self {
            visible: false,
            search_input,
            selected_index: 0,
            scroll_offset: 0,
            filtered_commands: MuxCommand::all()
                .iter()
                .filter_map(|cmd| cmd.fuzzy_match(""))
                .collect(),
        }
    }

    /// Open the palette.
    pub fn open(&mut self) {
        self.visible = true;
        self.search_input = TextArea::default();
        self.search_input
            .set_placeholder_text("Type to search commands...");
        self.search_input
            .set_cursor_line_style(ratatui::style::Style::default());
        self.selected_index = 0;
        self.scroll_offset = 0;
        self.update_filtered_commands();
    }

    /// Close the palette.
    pub fn close(&mut self) {
        self.visible = false;
    }

    /// Get the current search query.
    pub fn search_query(&self) -> String {
        self.search_input.lines().join("")
    }

    /// Update the filtered list of commands based on search query.
    pub fn update_filtered_commands(&mut self) {
        let query = self.search_query();
        let mut matches: Vec<CommandMatch> = MuxCommand::all()
            .iter()
            .filter_map(|cmd| cmd.fuzzy_match(&query))
            .collect();

        if !query.trim().is_empty() {
            matches.sort_by(|a, b| {
                b.score
                    .cmp(&a.score)
                    .then_with(|| a.command.label().cmp(b.command.label()))
            });
        }

        self.filtered_commands = matches;

        // Reset selection if it's out of bounds
        if self.selected_index >= self.filtered_commands.len() {
            self.selected_index = 0;
        }
    }

    /// Handle text input.
    pub fn handle_input(&mut self, input: impl Into<tui_textarea::Input>) {
        let old_query = self.search_query();
        self.search_input.input(input);
        let new_query = self.search_query();

        if old_query != new_query {
            self.update_filtered_commands();
            self.selected_index = 0;
            self.scroll_offset = 0;
        }
    }

    /// Move selection up.
    pub fn select_up(&mut self) {
        if !self.filtered_commands.is_empty() {
            self.selected_index = if self.selected_index == 0 {
                self.filtered_commands.len() - 1
            } else {
                self.selected_index - 1
            };
        }
    }

    /// Move selection down.
    pub fn select_down(&mut self) {
        if !self.filtered_commands.is_empty() {
            self.selected_index = (self.selected_index + 1) % self.filtered_commands.len();
        }
    }

    /// Get the currently selected command.
    pub fn selected_command(&self) -> Option<MuxCommand> {
        self.filtered_commands
            .get(self.selected_index)
            .map(|c| c.command)
    }

    /// Execute the selected command and close the palette.
    pub fn execute_selection(&mut self) -> Option<MuxCommand> {
        let cmd = self.selected_command();
        self.close();
        cmd
    }

    /// Get palette items grouped by category for rendering.
    /// Returns (items, selected_line_index) where selected_line_index is the
    /// line number of the currently selected item (accounting for headers/spacers).
    pub fn get_items(&self) -> (Vec<PaletteItem>, Option<usize>) {
        let mut items = Vec::new();
        let mut current_category: Option<&str> = None;
        let mut selected_line_index = None;

        for (idx, matched) in self.filtered_commands.iter().enumerate() {
            let category = matched.command.category();

            // Add category header if it changed
            if current_category != Some(category) {
                if current_category.is_some() {
                    // Add spacing between categories
                    items.push(PaletteItem::Header(String::new()));
                }
                items.push(PaletteItem::Header(category.to_string()));
                current_category = Some(category);
            }

            // Track line index of selected item
            if idx == self.selected_index {
                selected_line_index = Some(items.len());
            }

            items.push(PaletteItem::Command {
                command: matched.command,
                is_highlighted: idx == self.selected_index,
                label_highlights: matched.label_indices.clone(),
            });
        }

        (items, selected_line_index)
    }

    /// Update scroll offset to keep selected item visible.
    /// Call this after navigation with the visible height.
    pub fn adjust_scroll(&mut self, selected_line: usize, visible_height: usize) {
        // If selected item is above the visible area, scroll up
        if selected_line < self.scroll_offset {
            self.scroll_offset = selected_line;
        }
        // If selected item is below the visible area, scroll down
        else if selected_line >= self.scroll_offset + visible_height {
            self.scroll_offset = selected_line - visible_height + 1;
        }
        // Otherwise, keep current scroll position (don't jump)
    }

    /// Get count of filtered commands.
    pub fn filtered_count(&self) -> usize {
        self.filtered_commands.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn palette_filtering_works() {
        let mut palette = CommandPalette::new();
        palette.open();

        // Initial state should show all commands
        assert!(!palette.filtered_commands.is_empty());

        // Filter by "split"
        palette.search_input.insert_str("splt");
        palette.update_filtered_commands();

        // Should only show split-related commands and include highlight metadata
        assert!(palette
            .filtered_commands
            .iter()
            .all(|c| c.command.matches("splt")));
        assert!(palette
            .filtered_commands
            .iter()
            .any(|c| c.label_indices.len() == "splt".len()));
    }

    #[test]
    fn palette_matches_focus_main_area_abbreviation() {
        let mut palette = CommandPalette::new();
        palette.open();

        palette.search_input.insert_str("fmain ar");
        palette.update_filtered_commands();

        assert!(palette
            .filtered_commands
            .iter()
            .any(|c| c.command == MuxCommand::FocusMainArea));

        palette.search_input = TextArea::default();
        palette.search_input.insert_str("Focus Main Area");
        palette.update_filtered_commands();

        assert!(palette
            .filtered_commands
            .iter()
            .any(|c| c.command == MuxCommand::FocusMainArea));
    }

    #[test]
    fn palette_matches_focus_main_area_via_key_events() {
        use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

        let mut palette = CommandPalette::new();
        palette.open();

        let query = "fmain ar";
        for ch in query.chars() {
            let key_event = KeyEvent::new(KeyCode::Char(ch), KeyModifiers::NONE);
            palette.handle_input(key_event);
        }

        assert!(palette
            .filtered_commands
            .iter()
            .any(|c| c.command == MuxCommand::FocusMainArea));
    }

    #[test]
    fn palette_matches_exact_phrase_via_key_events() {
        use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

        let mut palette = CommandPalette::new();
        palette.open();

        // Type "Focus Main Area" character by character like the user would
        let query = "Focus Main Area";
        for ch in query.chars() {
            let key_event = KeyEvent::new(KeyCode::Char(ch), KeyModifiers::NONE);
            palette.handle_input(key_event);
        }

        assert!(
            palette
                .filtered_commands
                .iter()
                .any(|c| c.command == MuxCommand::FocusMainArea),
            "Expected FocusMainArea in filtered commands, but got: {:?}",
            palette.filtered_commands
        );
    }

    #[test]
    fn palette_navigation_works() {
        let mut palette = CommandPalette::new();
        palette.open();

        assert_eq!(palette.selected_index, 0);

        palette.select_down();
        assert_eq!(palette.selected_index, 1);

        palette.select_up();
        assert_eq!(palette.selected_index, 0);

        palette.select_up();
        assert_eq!(palette.selected_index, palette.filtered_commands.len() - 1);
    }

    #[test]
    fn palette_selection_works() {
        let mut palette = CommandPalette::new();
        palette.open();

        let selected = palette.selected_command();
        assert!(selected.is_some());
    }
}
