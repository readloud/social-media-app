pragma circom 2.1.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

// Main circuit for schedule verification
template ScheduleVerification() {
    // Private inputs
    signal input scheduleId;
    signal input userId;
    signal input postHash;
    signal input scheduledTimestamp;
    signal input secretNonce;
    signal input signature;
    
    // Public inputs
    signal output commitment;
    signal output merkleRoot;
    signal output timestamp;
    
    // Intermediate signals
    component poseidon = Poseidon(6);
    component hashCheck = Poseidon(2);
    
    // Compute commitment
    poseidon.inputs[0] <== scheduleId;
    poseidon.inputs[1] <== userId;
    poseidon.inputs[2] <== postHash;
    poseidon.inputs[3] <== scheduledTimestamp;
    poseidon.inputs[4] <== secretNonce;
    poseidon.inputs[5] <== signature;
    commitment <== poseidon.out;
    
    // Verify signature (simplified)
    component signatureVerifier = EdDSAPoseidonVerifier();
    signatureVerifier.enabled <== 1;
    signatureVerifier.Ax <== GetPubKeyX();
    signatureVerifier.Ay <== GetPubKeyY();
    signatureVerifier.R8x <== signature[0];
    signatureVerifier.R8y <== signature[1];
    signatureVerifier.S <== signature[2];
    signatureVerifier.M <== hashCheck.out;
    
    hashCheck.inputs[0] <== scheduleId;
    hashCheck.inputs[1] <== userId;
    hashCheck.out ==> signatureVerifier.M;
    
    // Timestamp validation
    component lessThan = LessThan(32);
    lessThan.in[0] <== scheduledTimestamp;
    lessThan.in[1] <== timestamp;
    lessThan.out === 1;
}

// Circuit for anonymous eligibility
template EligibilityVerification() {
    signal input age;
    signal input requiredAge;
    signal input isVerified;
    signal input requiredVerification;
    signal input secret;
    
    signal output meetsRequirements;
    
    component ageCheck = GreaterThan(32);
    ageCheck.in[0] <== age;
    ageCheck.in[1] <== requiredAge;
    
    component verificationCheck = IsEqual();
    verificationCheck.in[0] <== isVerified;
    verificationCheck.in[1] <== requiredVerification;
    
    meetsRequirements <== ageCheck.out * verificationCheck.out;
}

// Circuit for range proof
template RangeProof(n) {
    signal input value;
    signal input min;
    signal input max;
    signal input secret;
    
    signal output inRange;
    
    component minCheck = GreaterThan(n);
    minCheck.in[0] <== value;
    minCheck.in[1] <== min;
    
    component maxCheck = LessThan(n);
    maxCheck.in[0] <== value;
    maxCheck.in[1] <== max;
    
    inRange <== minCheck.out * maxCheck.out;
}

component main { public [commitment, merkleRoot, timestamp] } = ScheduleVerification();