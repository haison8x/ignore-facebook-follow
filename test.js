function findPossibleValues() {
    console.log("Finding values of x and y where 31^x - 5^y ≤ 6, with x≤5 and y≤12:");
    console.log("x\ty\t31^x\t5^y\t31^x-5^y");
    console.log("-".repeat(50));
    
    // Keep track of how many solutions we find
    let solutionCount = 0;
    
    for (let x = 1; x <= 5; x++) {
        for (let y = 1; y <= 12; y++) {
            // Calculate powers
            const power31 = BigInt(Math.pow(31, x));
            const power5 = BigInt(Math.pow(5, y));
            const difference = power31 - power5;
            
            // Check if the difference is less than or equal to 6
            if (difference <= 6n && difference >= -6n) {
                console.log(`${x}\t${y}\t${power31}\t${power5}\t${difference}`);
                solutionCount++;
            }
        }
    }
    
    console.log("-".repeat(50));
    console.log(`Total solutions found: ${solutionCount}`);
}

// Run the function
findPossibleValues();