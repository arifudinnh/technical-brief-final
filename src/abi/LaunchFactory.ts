import type { Abi } from 'viem'

const abi = [
  {
    "type": "function",
    "name": "launchFee",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getLaunchedToken",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct LaunchedToken",
        "components": [
          {
            "name": "token",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "curve",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "deployer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "pairToken",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "launchConfigId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "graduationThreshold",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "phase",
            "type": "uint8",
            "internalType": "uint8"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "canLaunch",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "previewLaunchEconomics",
    "inputs": [
      {
        "name": "launchConfigId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "pairToken",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "launchToken",
    "inputs": [
      {
        "name": "params",
        "type": "tuple",
        "internalType": "struct TokenParams",
        "components": [
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "symbol",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "logo",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "description",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "socials",
            "type": "tuple",
            "internalType": "struct Socials",
            "components": [
              {
                "name": "twitter",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "telegram",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "discord",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "website",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "farcaster",
                "type": "string",
                "internalType": "string"
              }
            ]
          },
          {
            "name": "creatorFeeRecipient",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "creatorTaxBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "buybackEnabled",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "expectedEconomics",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "salt",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      },
      {
        "name": "launchConfigId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "pairToken",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "curve",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "createGraduatedPool",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "TokenLaunched",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "curve",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "deployer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "pairToken",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "launchConfigId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "graduationThreshold",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  }
] as const

export default abi satisfies Abi
