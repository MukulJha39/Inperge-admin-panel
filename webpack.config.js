/* eslint-env node */
const path = require('path');
const dotenv = require('dotenv');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

dotenv.config();

// Deliberately a Webpack build, not Vite (PRD section 29).
module.exports = (_env, argv) => {
  const isProduction = argv.mode === 'production';
  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:4100/api/v1';
  const devServerPort = Number(process.env.DEV_SERVER_PORT || 3000);

  return {
    mode: isProduction ? 'production' : 'development',
    entry: path.resolve(__dirname, 'src/index.tsx'),
    devtool: isProduction ? 'source-map' : 'eval-cheap-module-source-map',

    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProduction ? 'assets/[name].[contenthash:8].js' : 'assets/[name].js',
      chunkFilename: isProduction ? 'assets/[name].[contenthash:8].chunk.js' : 'assets/[name].chunk.js',
      assetModuleFilename: 'assets/[name].[contenthash:8][ext]',
      publicPath: '/',
      clean: true,
    },

    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: { '@': path.resolve(__dirname, 'src') },
    },

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'ts-loader',
            // Type errors are reported by ForkTsChecker in parallel, which keeps rebuilds fast.
            options: { transpileOnly: true },
          },
        },
        {
          test: /\.css$/,
          use: [isProduction ? MiniCssExtractPlugin.loader : 'style-loader', 'css-loader'],
        },
        {
          test: /\.(png|jpe?g|gif|svg|webp|woff2?)$/i,
          type: 'asset/resource',
        },
      ],
    },

    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, 'public/index.html'),
        favicon: path.resolve(__dirname, 'public/favicon.png'),
        minify: isProduction && {
          collapseWhitespace: true,
          removeComments: true,
          minifyCSS: true,
        },
      }),
      // Only non-secret configuration is ever compiled into the bundle (PRD section 28).
      new webpack.DefinePlugin({
        'process.env.API_BASE_URL': JSON.stringify(apiBaseUrl),
        'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
      }),
      new ForkTsCheckerWebpackPlugin({
        typescript: { configFile: path.resolve(__dirname, 'tsconfig.json'), mode: 'write-references' },
      }),
      ...(isProduction
        ? [
            new MiniCssExtractPlugin({
              filename: 'assets/[name].[contenthash:8].css',
            }),
          ]
        : []),
    ],

    optimization: {
      splitChunks: {
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendor',
            chunks: 'all',
          },
        },
      },
    },

    performance: {
      hints: isProduction ? 'warning' : false,
      maxEntrypointSize: 512000,
      maxAssetSize: 512000,
    },

    devServer: {
      port: devServerPort,
      hot: true,
      open: false,
      // Client-side routing: unknown paths must return the app shell, not a 404.
      historyApiFallback: true,
      client: { overlay: { errors: true, warnings: false } },
      static: { directory: path.resolve(__dirname, 'public'), publicPath: '/' },
    },

    stats: 'minimal',
  };
};
