export const Escrow = {
    "address": "Bi8JW8SSePkgqQrKrjB3SSmFBZ3Bf1yWq1dMfC423D6j",
    "metadata": {
        "name": "escrow",
        "version": "0.1.0",
        "spec": "0.1.0",
        "description": "Created with Anchor"
    },
    "instructions": [
        {
            "name": "cancel_order",
            "discriminator": [
                95,
                129,
                237,
                240,
                8,
                49,
                223,
                132
            ],
            "accounts": [
                {
                    "name": "deposit_order",
                    "writable": true,
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const",
                                "value": [
                                    100,
                                    101,
                                    112,
                                    111,
                                    115,
                                    105,
                                    116,
                                    95,
                                    111,
                                    114,
                                    100,
                                    101,
                                    114
                                ]
                            },
                            {
                                "kind": "account",
                                "path": "deposit_order.order_id",
                                "account": "DepositOrder"
                            },
                            {
                                "kind": "account",
                                "path": "deposit_order.token_mint",
                                "account": "DepositOrder"
                            }
                        ]
                    }
                },
                {
                    "name": "authority",
                    "signer": true
                },
                {
                    "name": "user_token_account",
                    "writable": true
                },
                {
                    "name": "vault_token_account",
                    "writable": true
                },
                {
                    "name": "vault_authority",
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const",
                                "value": [
                                    118,
                                    97,
                                    117,
                                    108,
                                    116
                                ]
                            }
                        ]
                    }
                },
                {
                    "name": "token_program",
                    "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
                }
            ],
            "args": []
        },
        {
            "name": "deposit_tokens",
            "discriminator": [
                176,
                83,
                229,
                18,
                191,
                143,
                176,
                150
            ],
            "accounts": [
                {
                    "name": "deposit_order",
                    "writable": true,
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const",
                                "value": [
                                    100,
                                    101,
                                    112,
                                    111,
                                    115,
                                    105,
                                    116,
                                    95,
                                    111,
                                    114,
                                    100,
                                    101,
                                    114
                                ]
                            },
                            {
                                "kind": "arg",
                                "path": "order_id"
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
                    "writable": true,
                    "signer": true
                },
                {
                    "name": "mint"
                },
                {
                    "name": "user_token_account",
                    "writable": true
                },
                {
                    "name": "vault_token_account",
                    "writable": true
                },
                {
                    "name": "system_program",
                    "address": "11111111111111111111111111111111"
                },
                {
                    "name": "token_program",
                    "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
                },
                {
                    "name": "rent",
                    "address": "SysvarRent111111111111111111111111111111111"
                }
            ],
            "args": [
                {
                    "name": "order_id",
                    "type": "u64"
                },
                {
                    "name": "amount",
                    "type": "u64"
                },
                {
                    "name": "keeper",
                    "type": "pubkey"
                },
                {
                    "name": "timeout",
                    "type": "i64"
                }
            ]
        },
        {
            "name": "partially_execute_order",
            "discriminator": [
                25,
                189,
                93,
                177,
                43,
                242,
                82,
                213
            ],
            "accounts": [
                {
                    "name": "deposit_order",
                    "writable": true
                },
                {
                    "name": "keeper",
                    "signer": true
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
            "name": "update_order_status_to_ready",
            "discriminator": [
                221,
                232,
                253,
                123,
                181,
                101,
                83,
                39
            ],
            "accounts": [
                {
                    "name": "deposit_order",
                    "writable": true
                },
                {
                    "name": "keeper",
                    "signer": true
                }
            ],
            "args": []
        }
    ],
    "accounts": [
        {
            "name": "DepositOrder",
            "discriminator": [
                112,
                240,
                60,
                223,
                35,
                84,
                99,
                153
            ]
        }
    ],
    "errors": [
        {
            "code": 6000,
            "name": "OrderTimeout",
            "msg": "订单已超时"
        },
        {
            "code": 6001,
            "name": "InvalidOrderStatus",
            "msg": "订单状态无效"
        },
        {
            "code": 6002,
            "name": "InvalidAmount",
            "msg": "无效的金额"
        },
        {
            "code": 6003,
            "name": "Unauthorized",
            "msg": "未授权的操作"
        },
        {
            "code": 6004,
            "name": "InvalidTokenAccountOwner",
            "msg": "Token Account 所有权验证失败"
        },
        {
            "code": 6005,
            "name": "InvalidTokenMint",
            "msg": "Token Account Mint 不匹配"
        },
        {
            "code": 6006,
            "name": "InvalidTimeout",
            "msg": "超时时间设置无效"
        }
    ],
    "types": [
        {
            "name": "DepositOrder",
            "type": {
                "kind": "struct",
                "fields": [
                    {
                        "name": "order_id",
                        "type": "u64"
                    },
                    {
                        "name": "user",
                        "type": "pubkey"
                    },
                    {
                        "name": "amount",
                        "type": "u64"
                    },
                    {
                        "name": "token_mint",
                        "type": "pubkey"
                    },
                    {
                        "name": "keeper",
                        "type": "pubkey"
                    },
                    {
                        "name": "status",
                        "type": {
                            "defined": {
                                "name": "OrderStatus"
                            }
                        }
                    },
                    {
                        "name": "completed_amount",
                        "type": "u64"
                    },
                    {
                        "name": "timeout",
                        "type": "i64"
                    },
                    {
                        "name": "creation_time",
                        "type": "i64"
                    },
                    {
                        "name": "bump",
                        "type": "u8"
                    }
                ]
            }
        },
        {
            "name": "OrderStatus",
            "type": {
                "kind": "enum",
                "variants": [
                    {
                        "name": "Initialized"
                    },
                    {
                        "name": "ReadyToExecute"
                    },
                    {
                        "name": "Completed"
                    },
                    {
                        "name": "Cancelled"
                    }
                ]
            }
        }
    ]
}