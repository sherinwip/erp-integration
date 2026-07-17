package com.technomile.erpconfigapi.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.Map;

public class TargetDtos {
    public record TargetCreateDto(
            @NotBlank @Size(max = 150) String target_id,
            @NotBlank @Size(max = 50) String client_id,
            @NotBlank @Size(max = 100) String target_name,
            @NotBlank @Size(max = 500) String base_url,
            @NotBlank @Size(max = 20) String auth_type,
            @NotBlank @Size(max = 200) String credential_ref,
            Map<String, Object> default_headers,
            Boolean is_active
    ) {
    }

    public record TargetUpdateDto(
            @Size(max = 100) String target_name,
            @Size(max = 500) String base_url,
            @Size(max = 20) String auth_type,
            @Size(max = 200) String credential_ref,
            Map<String, Object> default_headers,
            Boolean is_active
    ) {
    }

    public record TargetReadDto(
            String target_id,
            String client_id,
            String target_name,
            String base_url,
            String auth_type,
            String credential_ref,
            Map<String, Object> default_headers,
            Boolean is_active,
            OffsetDateTime updated_at
    ) {
    }
}
