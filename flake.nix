{
  description = "LiveKit monitor with Rust/Node dev shell and Docker image";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    rust-overlay,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      overlays = [rust-overlay.overlays.default];
      pkgs = import nixpkgs {
        inherit system overlays;
      };

      rustToolchain = pkgs.rust-bin.stable.latest.default;

      # Linux pkgs for cross-compiling the Docker image
      linuxSystem =
        if system == "aarch64-darwin"
        then "aarch64-linux"
        else if system == "x86_64-darwin"
        then "x86_64-linux"
        else system;
      linuxPkgs = import nixpkgs {
        system = linuxSystem;
        inherit overlays;
      };
      staticPkgs = linuxPkgs.pkgsStatic;
      muslTarget =
        if linuxSystem == "aarch64-linux"
        then "aarch64-unknown-linux-musl"
        else if linuxSystem == "x86_64-linux"
        then "x86_64-unknown-linux-musl"
        else throw "Unsupported linuxSystem for musl target: ${linuxSystem}";
      linuxRustToolchain = linuxPkgs.rust-bin.stable.latest.default.override {
        targets = [muslTarget];
      };
      cleanSrc = pkgs.lib.cleanSourceWith {
        src = ./.;
        filter = path: type:
          let
            baseName = builtins.baseNameOf path;
          in
            baseName != "target"
            && baseName != "node_modules"
            && baseName != ".git"
            && baseName != ".npm"
            && baseName != "data"
            && baseName != ".agents"
            && !pkgs.lib.hasSuffix ".png" baseName;
      };

      mkMonitor = {
        rustPkgs,
        buildPkgs,
        target,
      }:
        rustPkgs.rustPlatform.buildRustPackage {
          pname = "livekit-dashboard";
          version = "0.1.0";
          src = cleanSrc;
          cargoLock.lockFile = ./Cargo.lock;
          nativeBuildInputs = [linuxRustToolchain rustPkgs.pkg-config];
          buildInputs = [buildPkgs.openssl buildPkgs.sqlite];
          CARGO_BUILD_TARGET = target;
          FRONTEND_DIR = "${frontendDist}";
          OPENSSL_STATIC = 1;
          OPENSSL_LIB_DIR = "${buildPkgs.openssl.out}/lib";
          OPENSSL_INCLUDE_DIR = "${buildPkgs.openssl.dev}/include";
          LIBSQLITE3_SYS_USE_PKG_CONFIG = 1;
          PKG_CONFIG_ALL_STATIC = 1;
          CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_RUSTFLAGS = "-C target-feature=+crt-static -L native=${buildPkgs.stdenv.cc.libc}/lib -C link-arg=-Wl,-Bstatic -C link-arg=-lsqlite3 -C link-arg=-lm -C link-arg=-lpthread -C link-arg=-lc";
          CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_RUSTFLAGS = "-C target-feature=+crt-static -L native=${buildPkgs.stdenv.cc.libc}/lib -C link-arg=-Wl,-Bstatic -C link-arg=-lsqlite3 -C link-arg=-lm -C link-arg=-lpthread -C link-arg=-lc";
          cargoBuildFlags = ["--target=${target}"];
          cargoTestFlags = ["--target=${target}"];
          postInstall = ''
            mkdir -p $out/share/livekit-dashboard/frontend
            cp -r ${frontendDist} $out/share/livekit-dashboard/frontend/dist
          '';
        };

      frontendDist = pkgs.buildNpmPackage {
        pname = "livekit-dashboard-frontend";
        version = "0.1.0";
        src = ./frontend;
        npmDepsHash = "sha256-0iipMhang1Vnnm9aqsy1VxLm/Hjj6/5aA96bFNDojxE=";
        installPhase = ''
          mkdir -p $out
          cp -r dist/* $out/
        '';
      };

      monitor = mkMonitor {
        rustPkgs = linuxPkgs;
        buildPkgs = staticPkgs;
        target = muslTarget;
      };

      dockerImage = linuxPkgs.dockerTools.buildLayeredImage {
        name = "livekit-monitor";
        tag = "latest";

        contents = [
          monitor
          linuxPkgs.cacert
          linuxPkgs.iana-etc
        ];

        config = {
          Cmd = ["/bin/livekit-dashboard"];
          Env = [
            "PORT=3000"
            "SQLITE_PATH=/data/monitor.db"
          ];
          ExposedPorts = {
            "3000/tcp" = {};
          };
          Volumes = {
            "/data" = {};
          };
        };
      };
    in {
      packages = {
        default = monitor;
        docker = dockerImage;
      };

      devShells.default = pkgs.mkShell {
        packages = [
          rustToolchain
          pkgs.pkg-config
          pkgs.openssl
          pkgs.nodejs_20
        ];

        shellHook = ''
          export RUST_BACKTRACE=1
          export PATH="$PWD/frontend/node_modules/.bin:$PATH"
        '';
      };
    });
}
