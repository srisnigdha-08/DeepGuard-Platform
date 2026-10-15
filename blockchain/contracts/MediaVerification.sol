// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MediaVerification
 * @notice Registers media file hashes on-chain for provenance verification.
 *
 * WHY blockchain for media verification?
 * Blockchain records are immutable — once a SHA-256 hash is registered,
 * no central authority can alter or delete that record.
 * If a file is modified after registration, its hash changes and
 * verification fails — proving tampering occurred.
 *
 * WHY Polygon over Ethereum mainnet?
 * Polygon gas fees are ~$0.001 vs Ethereum's ~$2–20 per transaction.
 * For a journalist registering dozens of clips daily, Polygon is practical.
 * Both chains are EVM-compatible — the same Solidity code runs on both.
 */
contract MediaVerification {

    struct MediaRecord {
        address registrant;   // who registered this hash
        uint256 timestamp;    // block timestamp at registration
        string  metadataURI;  // optional IPFS URI for extended metadata
        string  mediaType;    // "image" | "video" | "audio"
        bool    exists;       // sentinel for existence check
    }

    // Core mapping: SHA-256 hash (as bytes32) -> registration record
    mapping(bytes32 => MediaRecord) private records;

    // Events — indexable off-chain for audit logs and dashboards
    event MediaRegistered(
        bytes32 indexed mediaHash,
        address indexed registrant,
        uint256 timestamp,
        string  mediaType
    );

    event VerificationAttempt(
        bytes32 indexed mediaHash,
        address indexed verifier,
        bool    found
    );

    /**
     * @notice Register a media file's hash on-chain.
     * @param mediaHash  SHA-256 hash of the file (computed off-chain)
     * @param metadataURI Optional IPFS URI with extended metadata
     * @param mediaType   "image", "video", or "audio"
     */
    function registerMedia(
        bytes32 mediaHash,
        string  calldata metadataURI,
        string  calldata mediaType
    ) external returns (bool) {
        require(mediaHash != bytes32(0),    "Invalid hash: cannot be zero");
        require(!records[mediaHash].exists, "Hash already registered");

        records[mediaHash] = MediaRecord({
            registrant:  msg.sender,
            timestamp:   block.timestamp,
            metadataURI: metadataURI,
            mediaType:   mediaType,
            exists:      true
        });

        emit MediaRegistered(mediaHash, msg.sender, block.timestamp, mediaType);
        return true;
    }

    /**
     * @notice Verify whether a media hash has been registered.
     * @dev Emits VerificationAttempt for audit trail purposes.
     */
    function verifyMedia(bytes32 mediaHash)
        external
        returns (bool found, address registrant, uint256 timestamp, string memory mediaType)
    {
        MediaRecord memory rec = records[mediaHash];
        emit VerificationAttempt(mediaHash, msg.sender, rec.exists);

        if (!rec.exists) {
            return (false, address(0), 0, "");
        }
        return (true, rec.registrant, rec.timestamp, rec.mediaType);
    }

    /**
     * @notice Get full record without emitting events (read-only, no gas).
     */
    function getRecord(bytes32 mediaHash)
        external view
        returns (MediaRecord memory)
    {
        return records[mediaHash];
    }
}
