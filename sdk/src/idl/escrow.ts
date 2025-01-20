import { Idl } from "@coral-xyz/anchor";

export const IDL: Idl = {
    "version": "0.1.0",
    "name": "escrow",
    "metadata": {
        "name": "escrow",
        "version": "0.1.0",
        "spec": "0.1.0",
        "description": "Created with Anchor"
    },
    "instructions": [
        {
            "name": "cancelOrder",
            "accounts": [
                {
                    "name": "depositOrder",
                    "isMut": true,
                    "isSigner": false,
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const",
                                "value": [100, 101, 112, 111, 115, 105, 116, 95, 111, 114, 100, 101, 114]
                            },
                            {
                                "kind": "account",
                                "path": "deposit_order.order_id",
                                "account": "depositOrder"
                            },
                            {
                                "kind": "account",
                                "path": "deposit_order.token_mint",
                                "account": "depositOrder"
                            }
                        ]
                    }
                },
                {
                    "name": "authority",
                    "isMut": false,
                    "isSigner": true
                },
                {
                    "name": "userTokenAccount",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "vaultTokenAccount",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "vaultAuthority",
                    "isMut": false,
                    "isSigner": false,
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const",
                                "value": [118, 97, 117, 108, 116]
                            }
                        ]
                    }
                },
                {
                    "name": "tokenProgram",
                    "isMut": false,
                    "isSigner": false
                }
            ],
            "args": []
        },
        {
            "name": "depositTokens",
            "accounts": [
                {
                    "name": "depositOrder",
                    "isMut": true,
                    "isSigner": false,
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const",
                                "value": [100, 101, 112, 111, 115, 105, 116, 95, 111, 114, 100, 101, 114]
                            },
                            {
                                "kind": "arg",
                                "path": "orderId"
                            },
                            {
                                "kind": "account",
                                "path": "mint"
                            }
                        ]
                    }
                },
                {
                    "name": "user",
                    "isMut": true,
                    "isSigner": true
                },
                {
                    "name": "mint",
                    "isMut": false,
                    "isSigner": false
                },
                {
                    "name": "userTokenAccount",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "vaultTokenAccount",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "systemProgram",
                    "isMut": false,
                    "isSigner": false
                },
                {
                    "name": "tokenProgram",
                    "isMut": false,
                    "isSigner": false
                },
                {
                    "name": "rent",
                    "isMut": false,
                    "isSigner": false
                }
            ],
            "args": [
                {
                    "name": "orderId",
                    "type": "u64"
                },
                {
                    "name": "amount",
                    "type": "u64"
                },
                {
                    "name": "keeper",
                    "type": "publicKey"
                },
                {
                    "name": "timeout",
                    "type": "i64"
                }
            ]
        },
        {
            "name": "partiallyExecuteOrder",
            "accounts": [
                {
                    "name": "depositOrder",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "keeper",
                    "isMut": false,
                    "isSigner": true
                }
            ],
            "args": [
                {
                    "name": "amount",
                    "type": "u64"
                }
            ]
        },
        {
            "name": "updateOrderStatusToReady",
            "accounts": [
                {
                    "name": "depositOrder",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "keeper",
                    "isMut": false,
                    "isSigner": true
                }
            ],
            "args": []
        },
        {
            "name": "withdrawTokens",
            "accounts": [
                {
                    "name": "depositOrder",
                    "isMut": true,
                    "isSigner": false,
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const",
                                "value": [100, 101, 112, 111, 115, 105, 116, 95, 111, 114, 100, 101, 114]
                            },
                            {
                                "kind": "account",
                                "path": "deposit_order.order_id",
                                "account": "depositOrder"
                            },
                            {
                                "kind": "account",
                                "path": "deposit_order.token_mint",
                                "account": "depositOrder"
                            }
                        ]
                    }
                },
                {
                    "name": "keeper",
                    "isMut": true,
                    "isSigner": true
                },
                {
                    "name": "keeperTokenAccount",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "vaultTokenAccount",
                    "isMut": true,
                    "isSigner": false
                },
                {
                    "name": "vaultAuthority",
                    "isMut": false,
                    "isSigner": false,
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const",
                                "value": [118, 97, 117, 108, 116]
                            }
                        ]
                    }
                },
                {
                    "name": "tokenProgram",
                    "isMut": false,
                    "isSigner": false
                }
            ],
            "args": [
                {
                    "name": "amount",
                    "type": "u64"
                }
            ]
        }
    ],
    "accounts": [
        {
            "name": "depositOrder",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "orderId",
                        "type": "u64"
                    },
                    {
                        "name": "user",
                        "type": "publicKey"
                    },
                    {
                        "name": "amount",
                        "type": "u64"
                    },
                    {
                        "name": "tokenMint",
                        "type": "publicKey"
                    },
                    {
                        "name": "keeper",
                        "type": "publicKey"
                    },
                    {
                        "name": "status",
                        "type": {
                            "defined": "orderStatus"
                        }
                    },
                    {
                        "name": "completedAmount",
                        "type": "u64"
                    },
                    {
                        "name": "timeout",
                        "type": "i64"
                    },
                    {
                        "name": "creationTime",
                        "type": "i64"
                    },
                    {
                        "name": "bump",
                        "type": "u8"
                    }
                ]
            }
        }
    ],
    "errors": [
        {
            "code": 6000,
            "name": "orderTimeout",
            "msg": ""
        },
        {
            "code": 6001,
            "name": "invalidOrderStatus",
            "msg": ""
        },
        {
            "code": 6002,
            "name": "invalidAmount",
            "msg": ""
        },
        {
            "code": 6003,
            "name": "unauthorized",
            "msg": ""
        },
        {
            "code": 6004,
            "name": "invalidTokenAccountOwner",
            "msg": "Token Account 所有权验证失败"
        },
        {
            "code": 6005,
            "name": "invalidTokenMint",
            "msg": "Token Account Mint 不匹配"
        },
        {
            "code": 6006,
            "name": "invalidTimeout",
            "msg": ""
        }
    ],
    "types": [
        {
            "name": "orderStatus",
            "type": {
                "kind": "enum",
                "variants": [
                    {
                        "name": "initialized"
                    },
                    {
                        "name": "readyToExecute"
                    },
                    {
                        "name": "completed"
                    },
                    {
                        "name": "cancelled"
                    }
                ]
            }
        }
    ]
};