import { initializeKeypair } from "./initializeKeypair"
import { Connection, clusterApiUrl, PublicKey, Signer } from "@solana/web3.js"
import {
  Metaplex,
  keypairIdentity,
  bundlrStorage,
  toMetaplexFile,
  NftWithToken,
} from "@metaplex-foundation/js"
import * as fs from "fs"

// 有啥用？？？
interface NftData {
  name: string
  symbol: string
  description: string
  sellerFeeBasisPoints: number
  imageFile: string
}

interface CollectionNftData {
  name: string
  symbol: string
  description: string
  sellerFeeBasisPoints: number
  imageFile: string
  isCollection: boolean
  collectionAuthority: Signer
}

// example data for a new NFT
const nftData = {
  name: "Name",
  symbol: "SYMBOL",
  description: "Description",
  sellerFeeBasisPoints: 0,
  imageFile: "solana.png",
}

// example data for updating an existing NFT
const updateNftData = {
  name: "Update",
  symbol: "UPDATE",
  description: "Update Description",
  sellerFeeBasisPoints: 100,
  imageFile: "success.png",
}


// 助手函数，用于上传图片和元数据
async function uploadMetadata(
  metaplex: Metaplex,
  nftData: NftData,
): Promise<string> {
  
  // 图片转成字节数组
  const buffer = fs.readFileSync("src/" + nftData.imageFile)

  // 字节转成 metaplx 文件
  const file = toMetaplexFile(buffer, nftData.imageFile);

  const imageUri = await metaplex.storage().upload(file);
  console.log(`图片 URI 为：${imageUri}, 这是链下存储`);

  const { uri } = await metaplex.nfts().uploadMetadata({
    name: nftData.name,
    symbol: nftData.symbol,
    description: nftData.description,
    image: imageUri,
  });
  console.log(`元数据 URI 为：${uri}, 这是链下存储`);

  return uri;
}

// 创建 NFT 助手函数
async function createNft(
  metaplex: Metaplex,   // metaplex 实例
  uri: string,         // 元数据 URI
  nftData: NftData,    // NFT 数据
  collectionMint: PublicKey
): Promise<NftWithToken> {

  const { response, nft } = await metaplex.nfts().create(
    {
      uri: uri,
      name: nftData.name,
      sellerFeeBasisPoints: nftData.sellerFeeBasisPoints,
      symbol: nftData.symbol,
      // 添加集合地址
      collection: collectionMint,
    },
    { commitment: "finalized"},
  );

  console.log(`交易签名: https://explorer.solana.com/address/${response.signature}?cluster=devnet`);

  await metaplex.nfts().verifyCollection({
    mintAddress: nft.mint.address,
    collectionMintAddress: collectionMint,
    isSizedCollection: true,
  })

  return nft;
}

// 更新uri，用于更新已有的NFT
async function updataNftUri(
  metaplex: Metaplex,
  uri: string,
  mintAddress: PublicKey,) {
  
    // 根据铸币厂地址找到 nft 的数据
    const nft = await metaplex.nfts().findByMint({
      mintAddress
    })

    // 更新 nft 的 元数据（只更新列出来的字段）
    const { response } = await metaplex.nfts().update({
      nftOrSft: nft,
      uri: uri,
    },
    {
      commitment: "finalized"
    });

    console.log(`更新 NFT uri, NFT 地址 : ${nft.address.toString()}`);
    console.log(`更新 NFT uri, 交易签名 : https://explorer.solana.com/tx/${response.signature}?cluster=devnet`);
}

async function createCollectionNft(
  metaplex: Metaplex,
  uri: string,
  data: CollectionNftData
  ): Promise<NftWithToken> {
  
    const {response, nft } = await metaplex.nfts().create(
      {
        uri: uri,
        name: data.name,
        sellerFeeBasisPoints: data.sellerFeeBasisPoints,
        symbol: data.symbol,
        isCollection: true
      },
      { commitment: "finalized" }
    )

    console.log(`交易信息 https://explorer.solana.com/address/${response.signature}?cluster=devnet`);

    return nft
  }





async function main() {
  // create a new connection to the cluster's API
  const connection = new Connection(clusterApiUrl("devnet"))

  // initialize a keypair for the user
  const user = await initializeKeypair(connection)

  console.log("我的钱包地址 pubkey 为:", user.publicKey.toBase58())

  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(user))
    .use(
      bundlrStorage({
        address: "https://devnet.bundlr.network",
        providerUrl: "https://api.devnet.solana.com",
        timeout: 60000,
      }),
    );

  console.log(`step 1: 创建 metaplex 实例完成`);

  // 将 NFT 添加到指定 Collection 集合中
  const collectionNftData = {
    name: "TestCollectionNFT",
    symbol: "TEST",
    description: "Test Description Collection",
    sellerFeeBasisPoints: 100,
    imageFile: "success.png",
    isCollection: true,
    collectionAuthority: user,
  }

  // 上传 Collection NFT 集合的元数据，并得到 uri
  const collectionUri = await uploadMetadata(metaplex, collectionNftData);
  console.log(`step 2: 创建 NFT Collection 元数据完成, collectionUri ${collectionUri}`);

  // 创建 Collection NFT
  const collectionNft = await createCollectionNft(
    metaplex,
    collectionUri,
    collectionNftData,
  )
  console.log(`step 3: 创建 NFT Collection 完成, Collection地址: ${collectionNft.address.toString()}`);


  // 上传图片，获得元数据的uri
  const uri = await uploadMetadata(metaplex, nftData);
  console.log(`step 4: 创建 NFT 元数据完成, uri ${uri}`);

  // 创建 NFT（使用助手函数以及元数据的 uri）
  const nft = await createNft(metaplex, uri, nftData, collectionNft.mint.address);
  console.log(`step 5: 创建 NFT 并 verify 完成, Toke Mint: ${nft.address.toString()}`);

  // 上传新的元数据
  const updateUri = await uploadMetadata(metaplex, updateNftData);
  console.log(`step 6: 更新 NFT 元数据完成, updateUri ${updateUri}`);

  // 执行更新
  await updataNftUri(metaplex, updateUri, nft.address);
  console.log(`step 7: 更新 NFT 完成`);
}





main()
  .then(() => {
    console.log("Finished successfully")
    process.exit(0)
  })
  .catch((error) => {
    console.log(error)
    process.exit(1)
  })
