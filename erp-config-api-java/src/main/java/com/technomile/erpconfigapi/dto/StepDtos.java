package com.technomile.erpconfigapi.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.Map;

public class StepDtos {
    public record StepCreateDto(
            @NotBlank @Size(max = 50) String client_id,
            @NotBlank @Size(max = 150) String target_id,
            @NotBlank @Size(max = 100) String step_name,
            @NotBlank @Size(max = 10) String method,
            @NotBlank @Size(max = 500) String path,
            Map<String, Object> query_params,
            Map<String, Object> headers,
            Map<String, Object> extract,
            @Size(max = 20) String on_not_found,
            @Size(max = 20) String on_multiple_results,
            @Size(max = 10) String rollback_method,
            @Size(max = 500) String rollback_path,
            Boolean is_active
    ) {
    }

    public record StepUpdateDto(
            @Size(max = 150) String target_id,
            @Size(max = 100) String step_name,
            @Size(max = 10) String method,
            @Size(max = 500) String path,
            Map<String, Object> query_params,
            Map<String, Object> headers,
            Map<String, Object> extract,
            @Size(max = 20) String on_not_found,
            @Size(max = 20) String on_multiple_results,
            @Size(max = 10) String rollback_method,
            @Size(max = 500) String rollback_path,
            Boolean is_active
    ) {
    }

    public record StepReadDto(
            Long step_pk,
            String client_id,
            String target_id,
            String step_name,
            String method,
            String path,
            Map<String, Object> query_params,
            Map<String, Object> headers,
            Map<String, Object> extract,
            String on_not_found,
            String on_multiple_results,
            String rollback_method,
            String rollback_path,
            Boolean is_active,
            OffsetDateTime updated_at
    ) {
    }
}
