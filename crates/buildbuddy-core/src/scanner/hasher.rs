use std::fs::File;
use std::io::{BufReader, Read, Result};
use std::path::Path;

pub fn hash_file(path: &Path) -> Result<String> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0u8; 64 * 1024];

    loop {
        let bytes_read = reader.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hasher.finalize().to_hex().to_string())
}

pub fn hash_bytes(data: &[u8]) -> String {
    blake3::hash(data).to_hex().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;
    use std::io::Write;

    #[test]
    fn test_file_hashing() {
        let mut tmp = NamedTempFile::new().unwrap();
        writeln!(tmp, "hello buildbuddy").unwrap();
        tmp.flush().unwrap();

        let hash1 = hash_file(tmp.path()).unwrap();
        assert!(!hash1.is_empty());

        let hash2 = hash_file(tmp.path()).unwrap();
        assert_eq!(hash1, hash2);
    }
}

