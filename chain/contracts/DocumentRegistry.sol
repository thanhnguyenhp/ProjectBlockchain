// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract DocumentRegistry is Ownable {
    struct Doc { address owner; uint8 docType; string cid; bytes32 fileHash; uint64 createdAt; bool active; }
    mapping(bytes32 => Doc) public docs; mapping(address => bytes32[]) public byOwner;
    event DocumentAdded(bytes32 indexed id, address indexed owner, uint8 docType, string cid, bytes32 fileHash);
    event DocumentRevoked(bytes32 indexed id, address indexed owner);
    constructor(address owner_) Ownable(owner_) {}
    function _makeId(address owner, uint8 docType, string memory cid, bytes32 fileHash) internal view returns (bytes32) { return keccak256(abi.encode(owner, docType, cid, fileHash, block.timestamp)); }
    function addDocument(uint8 docType, string calldata cid, bytes32 fileHash) external returns (bytes32 id) { id=_makeId(msg.sender,docType,cid,fileHash); require(docs[id].owner==address(0),"exists"); docs[id]=Doc({owner:msg.sender,docType:docType,cid:cid,fileHash:fileHash,createdAt: uint64(block.timestamp),active:true}); byOwner[msg.sender].push(id); emit DocumentAdded(id,msg.sender,docType,cid,fileHash);} 
    function revoke(bytes32 id) external { Doc storage d=docs[id]; require(d.owner==msg.sender,"not owner"); d.active=false; emit DocumentRevoked(id,msg.sender);} 
    function get(bytes32 id) external view returns (Doc memory) { return docs[id]; }
    function listIds(address owner) external view returns (bytes32[] memory) { return byOwner[owner]; }
}
