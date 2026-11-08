use serde::Serialize;
use ts_rs::TS;

/// Structured error type returned by Tauri commands.
///
/// Each variant represents a distinct error category so the client can
/// distinguish between transient failures (network), permanent failures
/// (validation), and recoverable conditions (already exists).
#[derive(Debug, Clone, Serialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export, export_to = "types.ts")]
pub enum YapmodError {
    /// The requested resource was not found.
    NotFound { message: String },
    /// The input failed validation.
    Validation { message: String },
    /// A file or I/O operation failed.
    Io { message: String },
    /// A network request failed.
    Network { message: String },
    /// The resource already exists (e.g., plugin/theme already installed).
    AlreadyExists { message: String },
    /// A platform-specific system operation failed.
    System { message: String },
}

impl YapmodError {
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound {
            message: message.into(),
        }
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation {
            message: message.into(),
        }
    }

    pub fn io(message: impl Into<String>) -> Self {
        Self::Io {
            message: message.into(),
        }
    }

    pub fn network(message: impl Into<String>) -> Self {
        Self::Network {
            message: message.into(),
        }
    }

    pub fn already_exists(message: impl Into<String>) -> Self {
        Self::AlreadyExists {
            message: message.into(),
        }
    }

    pub fn system(message: impl Into<String>) -> Self {
        Self::System {
            message: message.into(),
        }
    }

    /// Returns the human-readable message for this error.
    pub fn message(&self) -> &str {
        match self {
            Self::NotFound { message } => message,
            Self::Validation { message } => message,
            Self::Io { message } => message,
            Self::Network { message } => message,
            Self::AlreadyExists { message } => message,
            Self::System { message } => message,
        }
    }
}

impl std::fmt::Display for YapmodError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let type_name = match self {
            Self::NotFound { .. } => "NotFound",
            Self::Validation { .. } => "Validation",
            Self::Io { .. } => "Io",
            Self::Network { .. } => "Network",
            Self::AlreadyExists { .. } => "AlreadyExists",
            Self::System { .. } => "System",
        };
        write!(f, "{}: {}", type_name, self.message())
    }
}

impl std::error::Error for YapmodError {}

impl From<std::io::Error> for YapmodError {
    fn from(error: std::io::Error) -> Self {
        match error.kind() {
            std::io::ErrorKind::NotFound => Self::not_found(error.to_string()),
            std::io::ErrorKind::AlreadyExists => Self::already_exists(error.to_string()),
            _ => Self::io(error.to_string()),
        }
    }
}

impl From<String> for YapmodError {
    fn from(error: String) -> Self {
        Self::network(error)
    }
}

#[cfg(test)]
mod tests {
    use super::YapmodError;

    #[test]
    fn serializes_with_discriminant_tag() {
        let error = YapmodError::not_found("plugin not found");
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains(r#""type":"not_found""#));
        assert!(json.contains(r#""message":"plugin not found""#));
    }

    #[test]
    fn all_variants_serialize() {
        let variants = [
            YapmodError::not_found("missing"),
            YapmodError::validation("invalid id"),
            YapmodError::io("read failed"),
            YapmodError::network("timeout"),
            YapmodError::already_exists("already installed"),
            YapmodError::system("not supported"),
        ];

        for variant in variants {
            let json = serde_json::to_string(&variant).unwrap();
            assert!(json.contains(r#""type":"#), "missing type tag in {json}");
            assert!(json.contains(r#""message":"#), "missing message in {json}");
        }
    }

    #[test]
    fn io_error_kind_maps_to_correct_variant() {
        let not_found = std::io::Error::new(std::io::ErrorKind::NotFound, "no such file");
        let mapped: YapmodError = not_found.into();
        assert!(matches!(mapped, YapmodError::NotFound { .. }));

        let already_exists = std::io::Error::new(std::io::ErrorKind::AlreadyExists, "exists");
        let mapped: YapmodError = already_exists.into();
        assert!(matches!(mapped, YapmodError::AlreadyExists { .. }));

        let other = std::io::Error::other("perm denied");
        let mapped: YapmodError = other.into();
        assert!(matches!(mapped, YapmodError::Io { .. }));
    }
}
