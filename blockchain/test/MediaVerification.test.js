const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MediaVerification Contract", function () {
  let mediaVerification;
  let owner;
  let addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    const MediaVerification = await ethers.getContractFactory("MediaVerification");
    mediaVerification = await MediaVerification.deploy();
    await mediaVerification.waitForDeployment();
  });

  it("should deploy with a valid address", async function () {
    const address = await mediaVerification.getAddress();
    expect(address).to.properAddress;
  });

  it("should register a new media hash successfully", async function () {
    const sampleHash = ethers.keccak256(ethers.toUtf8Bytes("DeepGuard test media content"));
    const metadataURI = "ipfs://QmSampleHashForDeepGuardVerification123";
    const mediaType = "image";

    await expect(mediaVerification.registerMedia(sampleHash, metadataURI, mediaType))
      .to.emit(mediaVerification, "MediaRegistered")
      .withArgs(sampleHash, owner.address, (val) => val > 0, mediaType);

    const record = await mediaVerification.getRecord(sampleHash);
    expect(record.exists).to.be.true;
    expect(record.registrant).to.equal(owner.address);
    expect(record.metadataURI).to.equal(metadataURI);
    expect(record.mediaType).to.equal(mediaType);
  });

  it("should reject registering a duplicate media hash", async function () {
    const sampleHash = ethers.keccak256(ethers.toUtf8Bytes("Unique media clip"));
    await mediaVerification.registerMedia(sampleHash, "", "video");

    await expect(
      mediaVerification.registerMedia(sampleHash, "", "video")
    ).to.be.revertedWith("Hash already registered");
  });

  it("should reject zero hash", async function () {
    await expect(
      mediaVerification.registerMedia(ethers.ZeroHash, "", "image")
    ).to.be.revertedWith("Invalid hash: cannot be zero");
  });

  it("should verify registered and unregistered hashes", async function () {
    const sampleHash = ethers.keccak256(ethers.toUtf8Bytes("Audit media file"));
    await mediaVerification.registerMedia(sampleHash, "ipfs://uri", "image");

    const [found, registrant, timestamp, mediaType] = await mediaVerification.verifyMedia.staticCall(sampleHash);
    expect(found).to.be.true;
    expect(registrant).to.equal(owner.address);
    expect(mediaType).to.equal("image");

    const unknownHash = ethers.keccak256(ethers.toUtf8Bytes("Non existent file"));
    const [notFound] = await mediaVerification.verifyMedia.staticCall(unknownHash);
    expect(notFound).to.be.false;
  });
});
