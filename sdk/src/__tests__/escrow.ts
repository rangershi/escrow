import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { EscrowSDK } from '../escrow';
import * as anchor from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';

describe('EscrowSDK', () => {
  let sdk: EscrowSDK;
  let connection: Connection;
  let wallet: anchor.Wallet;
  let programId: PublicKey;

  beforeEach(() => {
    connection = new Connection('http://localhost:8899', 'confirmed');
    wallet = new anchor.Wallet(Keypair.generate());
      programId = new PublicKey('9aaJ19ZKGUoGQDkzHVFVyhpK7iAviedofonxiT3Ayz81');
    sdk = new EscrowSDK(connection, wallet, programId);
  });

  it('should create vault authority PDA', async () => {
    const [vaultAuthority, _bump] = await sdk.getVaultAuthority();
    expect(vaultAuthority).toBeInstanceOf(PublicKey);
  });

  it('should create deposit order PDA', async () => {
    const orderId = new BN(1);
      const mint = new PublicKey('9aaJ19ZKGUoGQDkzHVFVyhpK7iAviedofonxiT3Ayz81');
    const [depositOrder, _bump] = await sdk.getDepositOrderPDA(orderId, mint);
    expect(depositOrder).toBeInstanceOf(PublicKey);
  });

  // Add more tests as needed
}); 