import { Connection, PublicKey } from '@solana/web3.js';
import { getAddressTokenBalance } from './fetchSupply.js';

// Test the new balance logic
async function testBalanceLogic() {
  const rpcUrl = process.env.RPC_URL;
  const mintAddr = process.env.TOKEN_MINT;
  
  if (!rpcUrl) {
    console.error('Missing RPC_URL environment variable');
    return;
  }
  
  if (!mintAddr) {
    console.error('Missing TOKEN_MINT environment variable');
    return;
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const mintPk = new PublicKey(mintAddr);

  // Test addresses (you can replace these with actual addresses from your locked wallets)
  const testAddresses = [
    // These are example addresses - replace with real ones from your locked wallets
    "4q49TWcn6KWSitczEVEjuwemsz3CkCfd5yR53PLNYA1K",
    "BGktdihTVWJUAoKXWxsFah9D3bJT9bLZHNGqpHusn4zX"
  ];

  console.log('Testing balance logic for addresses...');
  console.log(`Mint: ${mintAddr}`);
  console.log('---');

  for (const addr of testAddresses) {
    try {
      console.log(`Testing address: ${addr}`);
      
      // First, let's check what type of account this is
      const addrPk = new PublicKey(addr);
      const accountInfo = await connection.getAccountInfo(addrPk);
      
      if (accountInfo) {
        console.log(`  Account exists, data length: ${accountInfo.data.length}`);
        
        // Try to get token account balance directly
        try {
          const parsedAccountInfo = await connection.getParsedAccountInfo(addrPk);
          console.log(`  Parsed account info:`, JSON.stringify(parsedAccountInfo?.value?.data, null, 2));
          
          if (parsedAccountInfo?.value?.data?.program === 'spl-token' || parsedAccountInfo?.value?.data?.program === 'spl-token-2022') {
            const parsedData = parsedAccountInfo.value.data.parsed;
            console.log(`  Direct token account balance: ${parsedData.info.tokenAmount.amount} (mint: ${parsedData.info.mint})`);
            
            if (parsedData.info.mint === mintAddr) {
              console.log(`  ✅ This is a token account for our mint`);
            } else {
              console.log(`  ❌ This is a token account but for different mint`);
            }
          } else {
            console.log(`  ❌ Not a token account (program: ${parsedAccountInfo?.value?.data?.program})`);
          }
        } catch (e) {
          console.log(`  ❌ Not a valid token account: ${e.message}`);
        }
        
        // Try to get as owner
        try {
          const parsed = await connection.getParsedTokenAccountsByOwner(addrPk, { mint: mintPk });
          console.log(`  Owner has ${parsed.value.length} token accounts for this mint`);
        } catch (e) {
          console.log(`  ❌ Error checking as owner: ${e.message}`);
        }
      } else {
        console.log(`  ❌ Account does not exist`);
      }
      
      // Now test our new function
      console.log(`  Testing getAddressTokenBalance...`);
      const balance = await getAddressTokenBalance(connection, mintPk, addr);
      console.log(`  ✅ Final balance: ${balance.toString()}`);
      
    } catch (error) {
      console.error(`  ❌ Error testing ${addr}:`, error.message);
    }
    
    console.log('---');
  }
}

// Run the test
testBalanceLogic().catch(console.error); 