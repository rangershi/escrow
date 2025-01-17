import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Baggage } from "../target/types/baggage";
import { Keypair } from "@solana/web3.js";

describe("baggage", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Baggage as Program<Baggage>;
  const wallet = Keypair.generate();

  it("Is initialized!", async () => {   
    try {
      // 添加一个简单的日志来确认测试是否运行
      console.log("Starting test...");
      
      // 打印一些基本信息
      console.log("Program ID:", program.programId.toString());
      console.log("Wallet pubkey:", wallet.publicKey.toString());
      
      console.log("Test completed successfully");
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });
});
